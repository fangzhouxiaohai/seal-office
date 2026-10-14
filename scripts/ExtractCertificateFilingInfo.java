import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Collection;
import java.util.HexFormat;

/** Prints the certificate fields required by mainland China APP filing forms. */
public final class ExtractCertificateFilingInfo {
  private ExtractCertificateFilingInfo() {}

  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      throw new IllegalArgumentException("Usage: ExtractCertificateFilingInfo <certificate-or-chain>");
    }

    Collection<? extends java.security.cert.Certificate> parsed;
    try (InputStream input = Files.newInputStream(Path.of(args[0]))) {
      parsed = CertificateFactory.getInstance("X.509").generateCertificates(input);
    }
    if (parsed.isEmpty()) {
      throw new IllegalStateException("No X.509 certificate was found.");
    }

    X509Certificate leaf = null;
    for (java.security.cert.Certificate item : parsed) {
      X509Certificate certificate = (X509Certificate) item;
      if (certificate.getBasicConstraints() < 0) {
        leaf = certificate;
      }
    }
    if (leaf == null) {
      throw new IllegalStateException("The certificate chain does not contain a leaf certificate.");
    }

    byte[] encoded = leaf.getEncoded();
    byte[] publicKey = filingPublicKey(leaf);
    HexFormat hex = HexFormat.of();
    System.out.println("subject=" + leaf.getSubjectX500Principal().getName());
    System.out.println("publicKeyAlgorithm=" + leaf.getPublicKey().getAlgorithm());
    System.out.println("publicKey=" + hex.formatHex(publicKey));
    System.out.println("publicKeySpki=" + hex.formatHex(leaf.getPublicKey().getEncoded()));
    System.out.println("certificateMd5=" + digest("MD5", encoded));
    System.out.println("certificateSha1=" + digest("SHA-1", encoded));
    System.out.println("certificateSha256=" + digest("SHA-256", encoded));
  }

  private static byte[] filingPublicKey(X509Certificate certificate) {
    if (certificate.getPublicKey() instanceof RSAPublicKey rsa) {
      return unsigned(rsa.getModulus());
    }
    if (certificate.getPublicKey() instanceof ECPublicKey ec) {
      int coordinateBytes = (ec.getParams().getCurve().getField().getFieldSize() + 7) / 8;
      byte[] x = unsignedFixed(ec.getW().getAffineX(), coordinateBytes);
      byte[] y = unsignedFixed(ec.getW().getAffineY(), coordinateBytes);
      byte[] point = new byte[1 + x.length + y.length];
      point[0] = 0x04;
      System.arraycopy(x, 0, point, 1, x.length);
      System.arraycopy(y, 0, point, 1 + x.length, y.length);
      return point;
    }
    throw new IllegalStateException(
        "Unsupported public key algorithm: " + certificate.getPublicKey().getAlgorithm());
  }

  private static byte[] unsigned(BigInteger value) {
    byte[] bytes = value.toByteArray();
    if (bytes.length > 1 && bytes[0] == 0) {
      byte[] result = new byte[bytes.length - 1];
      System.arraycopy(bytes, 1, result, 0, result.length);
      return result;
    }
    return bytes;
  }

  private static byte[] unsignedFixed(BigInteger value, int length) {
    byte[] source = unsigned(value);
    if (source.length > length) {
      throw new IllegalStateException("Public-key coordinate is longer than the curve field.");
    }
    byte[] result = new byte[length];
    System.arraycopy(source, 0, result, length - source.length, source.length);
    return result;
  }

  private static String digest(String algorithm, byte[] value) throws Exception {
    return HexFormat.of().formatHex(MessageDigest.getInstance(algorithm).digest(value));
  }
}

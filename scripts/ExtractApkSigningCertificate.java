import com.android.apksig.ApkVerifier;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.security.interfaces.RSAPublicKey;
import java.util.HexFormat;
import java.util.List;

/** Extracts the first verified signer certificate from an APK signing block. */
public final class ExtractApkSigningCertificate {
  private ExtractApkSigningCertificate() {}

  public static void main(String[] args) throws Exception {
    if (args.length != 2) {
      throw new IllegalArgumentException("Usage: ExtractApkSigningCertificate <apk> <certificate.der>");
    }

    ApkVerifier.Result result = new ApkVerifier.Builder(new File(args[0])).build().verify();
    if (!result.isVerified()) {
      throw new IllegalStateException("APK signature verification failed: " + result.getErrors());
    }

    List<X509Certificate> certificates = result.getSignerCertificates();
    if (certificates.isEmpty()) {
      throw new IllegalStateException("The APK does not contain a verified signer certificate.");
    }

    X509Certificate certificate = certificates.get(0);
    byte[] encoded = certificate.getEncoded();
    Files.write(Path.of(args[1]), encoded);

    if (!(certificate.getPublicKey() instanceof RSAPublicKey rsaPublicKey)) {
      throw new IllegalStateException(
          "Unsupported public key algorithm: " + certificate.getPublicKey().getAlgorithm());
    }

    HexFormat hex = HexFormat.of();
    System.out.println("publicKeyModulus=" + rsaPublicKey.getModulus().toString(16));
    System.out.println("certificateMd5=" + hex.formatHex(MessageDigest.getInstance("MD5").digest(encoded)));
  }
}

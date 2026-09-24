interface Props { 数据?: string }
const PdfViewer = ({ 数据 }: Props) => <div className="pdf-viewer">{数据 ? <iframe title="PDF 预览" src={`data:application/pdf;base64,${数据}`} /> : <span>暂无 PDF 预览</span>}</div>
export default PdfViewer

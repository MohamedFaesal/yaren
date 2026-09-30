import { renderSVG } from "uqr";

export function QrMark({ value }: { value: string }) {
  return <span className="qr" dangerouslySetInnerHTML={{ __html: renderSVG(value, { ecc: "M", border: 1, pixelSize: 4, blackColor: "#0B3142" }) }} />;
}

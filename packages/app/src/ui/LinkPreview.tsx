import { Link } from "../router.tsx";
import { Media } from "./Media.tsx";
/** Renders supplied preview content. Never fetches the destination in the browser. */
export function LinkPreview({
  url,
  title,
  description,
}: {
  url: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rc-link-preview">
      <Media thumb />
      <div className="rc-link-preview-text">
        <Link href={url}>{title}</Link>
        <p className="rc-meta">{description}</p>
      </div>
    </div>
  );
}

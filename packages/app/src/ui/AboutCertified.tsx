import { CERTIFIED } from "../links.ts";
const FACTS = [
  [
    "What it is",
    "A free account for your profile and your work that does not belong to any one app. The Hypercerts Foundation runs it.",
  ],
  [
    "Why Weave uses it",
    "So you do not need a separate Weave account. The same sign-in works in other apps that use Certified.",
  ],
  [
    "How you sign in",
    "With your email address. Certified sends you a code, so there is no password. If you are new, you can join there and come straight back.",
  ],
  [
    "What Weave learns",
    "Who you are on Certified, and nothing else. Weave does not keep an email address from sign-in, and you do not need a public project there.",
  ],
] as const;
/** What Certified is, wherever sign-in names it. It opens in place, so it also works inside the account door. */
export function AboutCertified() {
  return (
    <details>
      <summary className="rc-footer-link">What is Certified?</summary>
      <div className="rc-stack">
        <dl className="rc-facts">
          {FACTS.map(([title, body]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
        <p>
          <a href={CERTIFIED} target="_blank" rel="noopener noreferrer">
            Read more on Certified
          </a>
        </p>
      </div>
    </details>
  );
}

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface DigestEmailItem {
  title: string;
  company: string;
  locations: string;
  url: string;
  score: number;
  hasJd: boolean;
  wildcard: boolean;
  /** One-line "why this score" from the top contributions. */
  why: string | null;
  appliedLink: string;
  upLink: string;
  downLink: string;
}

// Email-client-safe palette matching the app's light theme.
const INK = "#1c1917";
const MUTED = "#78716c";
const FAINT = "#a8a29e";
const HAIRLINE = "#e7e5e4";
const ACCENT = "#0d9488";
const CANVAS = "#fafaf9";
const SURFACE = "#ffffff";
const WARN = "#a16207";

const FONT =
  "ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Consolas, monospace";

export default function DigestEmail({
  items,
  matchesUrl,
  settingsUrl,
  unsubscribeUrl,
}: {
  items: DigestEmailItem[];
  matchesUrl: string;
  settingsUrl: string;
  unsubscribeUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        {`${items.length} internship match${items.length === 1 ? "" : "es"} for you`}
      </Preview>
      <Body style={{ fontFamily: FONT, backgroundColor: CANVAS, color: INK }}>
        <Container
          style={{
            backgroundColor: SURFACE,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: 8,
            padding: 24,
            maxWidth: 560,
          }}
        >
          <Heading
            as="h2"
            style={{ fontSize: 18, letterSpacing: "-0.01em", margin: "0 0 16px" }}
          >
            Your intern-radar matches
          </Heading>
          {items.map((item) => (
            <Section key={item.url} style={{ marginBottom: 8 }}>
              <Text style={{ margin: 0, fontSize: 14, lineHeight: "22px" }}>
                <Link
                  href={item.url}
                  style={{ fontWeight: 600, color: INK, textDecoration: "none" }}
                >
                  {item.title}
                </Link>{" "}
                <span style={{ fontFamily: MONO, color: MUTED, fontSize: 13 }}>
                  {Math.round(item.score * 100)}
                </span>
                {item.wildcard && (
                  <span style={{ color: ACCENT, fontSize: 12 }}> · wildcard</span>
                )}
              </Text>
              <Text
                style={{ margin: 0, color: MUTED, fontSize: 12, lineHeight: "18px" }}
              >
                {item.company} · {item.locations}
                {item.hasJd ? (
                  ""
                ) : (
                  <span style={{ color: WARN }}>
                    {" "}
                    · Couldn&apos;t read job description
                  </span>
                )}
              </Text>
              {item.why && (
                <Text
                  style={{
                    margin: 0,
                    color: FAINT,
                    fontSize: 12,
                    lineHeight: "18px",
                  }}
                >
                  Why: {item.why}
                </Text>
              )}
              <Text style={{ margin: "4px 0 0 0", fontSize: 13 }}>
                <Link href={item.appliedLink} style={{ color: ACCENT }}>
                  I applied
                </Link>
                {"   ·   "}
                <Link href={item.upLink} style={{ color: ACCENT }}>
                  👍
                </Link>
                {"   ·   "}
                <Link href={item.downLink} style={{ color: ACCENT }}>
                  👎
                </Link>
              </Text>
              <Hr style={{ borderColor: HAIRLINE, margin: "12px 0" }} />
            </Section>
          ))}
          <Text style={{ fontSize: 14 }}>
            <Link href={matchesUrl} style={{ color: ACCENT, fontWeight: 500 }}>
              See all matches
            </Link>
          </Text>
          <Hr style={{ borderColor: HAIRLINE, margin: "16px 0" }} />
          <Text style={{ fontSize: 12, color: FAINT }}>
            <Link href={settingsUrl} style={{ color: FAINT }}>
              Email settings
            </Link>
            {"   ·   "}
            <Link href={unsubscribeUrl} style={{ color: FAINT }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

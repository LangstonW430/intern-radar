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
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#fafafa" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            padding: 24,
            maxWidth: 560,
          }}
        >
          <Heading as="h2">Your intern-radar matches</Heading>
          {items.map((item) => (
            <Section key={item.url} style={{ marginBottom: 8 }}>
              <Text style={{ margin: 0 }}>
                <Link href={item.url} style={{ fontWeight: 600 }}>
                  {item.title}
                </Link>{" "}
                · {Math.round(item.score * 100)}
                {item.wildcard ? " · wildcard" : ""}
              </Text>
              <Text style={{ margin: 0, color: "#666" }}>
                {item.company} · {item.locations}
                {item.hasJd ? "" : " · Couldn't read job description"}
              </Text>
              {item.why && (
                <Text style={{ margin: 0, color: "#888", fontSize: 13 }}>
                  Why: {item.why}
                </Text>
              )}
              <Text style={{ margin: "4px 0 0 0", fontSize: 13 }}>
                <Link href={item.appliedLink}>I applied</Link>
                {"   ·   "}
                <Link href={item.upLink}>👍</Link>
                {"   ·   "}
                <Link href={item.downLink}>👎</Link>
              </Text>
              <Hr style={{ borderColor: "#eee", margin: "12px 0" }} />
            </Section>
          ))}
          <Text>
            <Link href={matchesUrl}>See all matches</Link>
          </Text>
          <Hr style={{ borderColor: "#eee", margin: "16px 0" }} />
          <Text style={{ fontSize: 12, color: "#999" }}>
            <Link href={settingsUrl} style={{ color: "#999" }}>
              Email settings
            </Link>
            {"   ·   "}
            <Link href={unsubscribeUrl} style={{ color: "#999" }}>
              Unsubscribe
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

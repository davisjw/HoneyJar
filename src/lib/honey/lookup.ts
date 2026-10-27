export type ContactLookup = {
  name: string;
  phone: string;
  website: string;
  email: string;
  street: string;
  city: string;
  region: string;
  postal: string;
  hours: string;
};

const SKIP_HOST = /(^|\.)(google|duckduckgo|facebook|instagram|yelp|wikipedia|linkedin|youtube|twitter|x|tiktok|mapquest|yellowpages|bbb|reddit)\.[a-z.]+$/i;

export function searchResultUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/uddg=([^&"']+)/g)) {
    try {
      const url = decodeURIComponent(match[1] ?? "");
      if (url.startsWith("http")) urls.push(url);
    } catch {
      /* A broken result link is skipped. */
    }
  }
  return urls;
}

export function preferredWebsite(urls: string[]): string | null {
  for (const url of urls) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (!SKIP_HOST.test(host)) return url;
    } catch {
      /* Skip a result that is not a URL. */
    }
  }
  return null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function collectNodes(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  if (node["@graph"]) collectNodes(node["@graph"], out);
  out.push(node);
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const kind = node["@type"];
  if (Array.isArray(kind)) return kind.map((item) => String(item));
  if (typeof kind === "string") return [kind];
  return [];
}

function addressOf(value: unknown): Pick<ContactLookup, "street" | "city" | "region" | "postal"> {
  if (!value || typeof value !== "object") return { street: "", city: "", region: "", postal: "" };
  const address = value as Record<string, unknown>;
  return {
    street: asText(address.streetAddress),
    city: asText(address.addressLocality),
    region: asText(address.addressRegion),
    postal: asText(address.postalCode),
  };
}

function hoursOf(node: Record<string, unknown>): string {
  const plain = node.openingHours;
  if (typeof plain === "string") return plain.trim();
  if (Array.isArray(plain)) return plain.map((item) => asText(item)).filter(Boolean).join("; ");
  return "";
}

/** Read a public business page. Schema.org is preferred. tel: and mailto: links fill the gaps. */
export function parseContactHtml(html: string, pageUrl: string): ContactLookup {
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectNodes(JSON.parse(match[1] ?? ""), nodes);
    } catch {
      /* A page can contain broken JSON-LD beside a usable one. */
    }
  }
  const ranked = nodes.filter((node) => {
    const types = nodeTypes(node).join(" ");
    return /LocalBusiness|Organization|Store|Bank|FinancialService|GovernmentOrganization/.test(types) || node.telephone || node.address;
  });
  const node = ranked[0] ?? {};
  const address = addressOf(node.address);
  const tel = html.match(/href=["']tel:([^"']+)["']/i);
  const mail = html.match(/href=["']mailto:([^"'?]+)/i);
  let website = asText(node.url) || pageUrl;
  try {
    website = new URL(website, pageUrl).toString();
  } catch {
    website = pageUrl;
  }
  return {
    name: asText(node.name),
    phone: asText(node.telephone) || decodeURIComponent(tel?.[1] ?? "").replace(/^tel:/i, ""),
    website,
    email: asText(node.email) || decodeURIComponent(mail?.[1] ?? ""),
    street: address.street,
    city: address.city,
    region: address.region,
    postal: address.postal,
    hours: hoursOf(node).slice(0, 240),
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
    headers: { "user-agent": "HoneyJar/2 contact lookup", accept: "text/html" },
  });
  if (!response.ok) throw new Error("The public page did not answer.");
  return (await response.text()).slice(0, 500_000);
}

/** Find a public website for the business, then read the phone, address, and hours it publishes. */
export async function lookupBusiness(name: string): Promise<ContactLookup> {
  const query = name.trim();
  if (query.length < 2) throw new Error("Type the business name first.");
  const search = await fetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} official website`)}`);
  const site = preferredWebsite(searchResultUrls(search));
  if (!site) throw new Error("No public website was found for that name.");
  const page = await fetchText(site);
  const found = parseContactHtml(page, site);
  return { ...found, name: found.name || query, website: found.website || site };
}

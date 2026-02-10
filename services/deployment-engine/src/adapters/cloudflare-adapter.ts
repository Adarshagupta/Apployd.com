import { z } from 'zod';

const responseSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ code: z.number(), message: z.string() })).optional(),
});

export class CloudflareAdapter {
  constructor(
    private readonly token: string,
    private readonly zoneId: string,
  ) {}

  async upsertARecord(name: string, ipAddress: string): Promise<void> {
    const payload = {
      type: 'A',
      name,
      content: ipAddress,
      ttl: 120,
      proxied: false, // DNS-only mode so Let's Encrypt SSL works directly
    };

    const existingId = await this.findRecordId(name);

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records${existingId ? `/${existingId}` : ''}`, {
      method: existingId ? 'PUT' : 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    const parsed = responseSchema.safeParse(json);

    if (!parsed.success || !parsed.data.success) {
      const message = parsed.success
        ? (parsed.data.errors?.map((error) => error.message).join(', ') ?? 'Cloudflare API error')
        : 'Malformed Cloudflare API response';
      throw new Error(message);
    }
  }

  private async findRecordId(name: string): Promise<string | null> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${this.zoneId}/dns_records?type=A&name=${encodeURIComponent(name)}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const json = await response.json() as { result?: Array<{ id: string }> };
    return json.result?.[0]?.id ?? null;
  }
}

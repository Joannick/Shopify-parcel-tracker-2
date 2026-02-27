export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const body = await request.json() as { trackingNumber?: string };
      const trackingNumber = body.trackingNumber?.trim().toUpperCase();

      if (!trackingNumber) {
        return new Response(
          JSON.stringify({ error: 'Tracking number is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tracking = await scrapeTracking(trackingNumber);

      return new Response(JSON.stringify(tracking), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch tracking information. Please check the tracking number.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};

async function scrapeTracking(trackingNumber: string) {
  const url = `https://parcelsapp.com/fr/tracking/${trackingNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    const status = extractFromHtml(html, ['status', 'livré', 'en transit', 'exception']) || 'Statut indisponible';
    const location = extractFromHtml(html, ['localisation', 'location', 'city']) || 'Localisation inconnue';
    const carrier = extractFromHtml(html, ['transporteur', 'carrier', 'dpd', 'chronopost', 'ups']) || 'Transporteur inconnu';
    const estimatedDelivery = extractFromHtml(html, ['livraison', 'delivery', 'arrive']) || 'Date non disponible';

    return {
      trackingNumber,
      status,
      location,
      carrier,
      estimatedDelivery,
      events: [],
      lastUpdate: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  }
}

function extractFromHtml(html: string, keywords: string[]): string {
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}[^<]*`, 'i');
    const match = html.match(regex);
    if (match) {
      const text = match[0]
        .replace(/<[^>]*>/g, '')
        .replace(/&[^;]+;/g, '')
        .trim();
      if (text.length > 0 && text.length < 200) {
        return text;
      }
    }
  }
  return '';
}

// netlify/functions/create-payment.js
//
// Crea una factura (invoice) en Plisio para que el usuario recargue saldo.
// Recibe el uid del usuario logueado y el monto en USD que quiere recargar.
// Plisio devuelve un link de pago (invoice_url); el usuario paga ahí con
// USDT, y cuando el pago se confirma, Plisio avisa a plisio-webhook.js,
// que se encarga de sumar el saldo en Firestore.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { uid, amount } = JSON.parse(event.body || '{}');

    if (!uid || typeof uid !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta el uid del usuario' }) };
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Monto inválido' }) };
    }
    if (numericAmount < 3) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El monto mínimo de recarga es $3' }) };
    }

    const SECRET_KEY = process.env.PLISIO_SECRET_KEY;
    if (!SECRET_KEY) {
      console.error('Falta PLISIO_SECRET_KEY en las variables de entorno');
      return { statusCode: 500, body: JSON.stringify({ error: 'Configuración del servidor incompleta' }) };
    }

    const siteUrl = `https://${event.headers.host}`;
    // order_number lleva el uid, para que el webhook sepa a quién sumarle el saldo.
    // Le agregamos un timestamp para que cada intento tenga un identificador único.
    const orderNumber = `${uid}_${Date.now()}`;

    const params = new URLSearchParams({
      source_currency: 'USD',
      source_amount: String(numericAmount),
      order_number: orderNumber,
      order_name: `Recarga de saldo Bitercards - $${numericAmount}`,
      currency: 'USDT_TRX', // USDT en red TRON (TRC20), la más barata
      callback_url: `${siteUrl}/.netlify/functions/plisio-webhook?json=true`,
      success_url: `${siteUrl}/?recarga=exitosa`,
      api_key: SECRET_KEY,
    });

    const plisioResponse = await fetch(`https://api.plisio.net/api/v1/invoices/new?${params.toString()}`);
    const data = await plisioResponse.json();

    if (data.status !== 'success') {
      console.error('Error de Plisio:', data);
      return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo crear el pago', details: data }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ invoice_url: data.data.invoice_url }),
    };
  } catch (err) {
    console.error('Error en create-payment:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno' }) };
  }
};

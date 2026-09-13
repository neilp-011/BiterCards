// netlify/functions/create-payment.js
//
// Esta función recibe: el uid del usuario logueado y el monto en USD que quiere recargar.
// Crea una "factura" (invoice) en NOWPayments y devuelve el link de pago (invoice_url).
// El usuario abre ese link, paga con USDT/USDC, y cuando el pago se confirma,
// NOWPayments avisa a nowpayments-webhook.js, que ya se encarga de sumar el saldo.

exports.handler = async (event) => {
  // Solo aceptar POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { uid, amount } = JSON.parse(event.body || '{}');

    // Validaciones básicas
    if (!uid || typeof uid !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta el uid del usuario' }) };
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Monto inválido' }) };
    }
    // Límite mínimo razonable (NOWPayments suele rechazar montos muy pequeños)
    if (numericAmount < 5) {
      return { statusCode: 400, body: JSON.stringify({ error: 'El monto mínimo de recarga es $5' }) };
    }

    const API_KEY = process.env.NOWPAYMENTS_API_KEY;
    if (!API_KEY) {
      console.error('Falta NOWPAYMENTS_API_KEY en las variables de entorno');
      return { statusCode: 500, body: JSON.stringify({ error: 'Configuración del servidor incompleta' }) };
    }

    const siteUrl = `https://${event.headers.host}`;

    const nowResponse = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: numericAmount,
        price_currency: 'usd',
        order_id: uid, // el webhook usa esto para saber a quién sumarle el saldo
        order_description: `Recarga de saldo Bitercards - ${numericAmount} USD`,
        ipn_callback_url: `${siteUrl}/.netlify/functions/nowpayments-webhook`,
        success_url: `${siteUrl}/?recarga=exitosa`,
        cancel_url: `${siteUrl}/?recarga=cancelada`,
      }),
    });

    const data = await nowResponse.json();

    if (!nowResponse.ok) {
      console.error('Error de NOWPayments:', data);
      return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo crear el pago', details: data }) };
    }

    // data.invoice_url es el link al que mandamos al usuario para que pague
    return {
      statusCode: 200,
      body: JSON.stringify({ invoice_url: data.invoice_url }),
    };
  } catch (err) {
    console.error('Error en create-payment:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error interno' }) };
  }
};

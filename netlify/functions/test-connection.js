
exports.handler = async function () {
  const apiKey = process.env.FAZERCARDS_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar FAZERCARDS_API_KEY en Netlify' })
    };
  }

  try {
    const res = await fetch('https://reseller.fazercards.com/api/v2/me', {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.message || 'FazerCards rechazó la key' }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo contactar a FazerCards' }) };
  }
};

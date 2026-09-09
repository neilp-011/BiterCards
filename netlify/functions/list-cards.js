exports.handler = async function (event) {
  const apiKey = process.env.FAZERCARDS_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Falta configurar FAZERCARDS_API_KEY en Netlify' }) };
  }

  const categoryId = event.queryStringParameters && event.queryStringParameters.category_id;
  if (!categoryId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el parámetro category_id en la URL' }) };
  }

  try {
    const res = await fetch('https://reseller.fazercards.com/api/v2/giftcards/cards?category_id=' + encodeURIComponent(categoryId), {
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
    });

    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data.message || 'Error al leer las tarjetas' }) };
    }

    return { statusCode: 200, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo contactar a FazerCards' }) };
  }
};

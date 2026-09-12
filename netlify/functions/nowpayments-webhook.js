// Esta función recibe el aviso automático (IPN) de NOWPayments cuando
// alguien completa un pago, y le suma el saldo correspondiente al usuario
// dentro de Firestore.
//
// NUNCA se llama desde el navegador del usuario. Solo NOWPayments le habla
// a esta función, directamente desde sus servidores.

const crypto = require('crypto');
const admin = require('firebase-admin');

// Inicializa Firebase Admin una sola vez (se reutiliza entre llamadas)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// Ordena las llaves de un objeto de forma recursiva (alfabéticamente),
// tal como exige NOWPayments para poder verificar la firma del aviso.
function ordenarObjeto(obj) {
  if (Array.isArray(obj)) {
    return obj.map(ordenarObjeto);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = ordenarObjeto(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // 1) Verificar que el aviso realmente viene de NOWPayments,
  //    comparando la firma que manda contra una firma calculada aquí
  //    con tu IPN Secret (nunca confíes en un aviso sin verificar).
  const firmaRecibida = event.headers['x-nowpayments-sig'];
  const cuerpoOrdenado = JSON.stringify(ordenarObjeto(JSON.parse(event.body)));
  const firmaCalculada = crypto
    .createHmac('sha512', process.env.NOWPAYMENTS_IPN_SECRET)
    .update(cuerpoOrdenado)
    .digest('hex');

  if (firmaRecibida !== firmaCalculada) {
    console.error('Firma inválida: este aviso no viene de NOWPayments.');
    return { statusCode: 401, body: 'Firma inválida' };
  }

  const pago = JSON.parse(event.body);

  // 2) Solo actuar cuando el pago está realmente confirmado.
  //    NOWPayments manda varios estados intermedios (waiting, confirming...);
  //    "finished" es el único que significa "el dinero ya llegó de verdad".
  if (pago.payment_status !== 'finished') {
    return { statusCode: 200, body: 'Recibido, esperando confirmación final.' };
  }

  // 3) El uid del usuario viaja en "order_id" (lo mandamos nosotros al
  //    crear el cobro, en el siguiente paso que armamos).
  const uid = pago.order_id;
  const montoUSD = Number(pago.price_amount);

  if (!uid || !montoUSD) {
    console.error('Aviso sin uid o sin monto válido:', pago);
    return { statusCode: 400, body: 'Datos incompletos' };
  }

  // 4) Evitar sumar el mismo pago dos veces si NOWPayments reenvía el aviso.
  const pagoRef = db.collection('pagos_procesados').doc(String(pago.payment_id));
  const yaExiste = (await pagoRef.get()).exists;
  if (yaExiste) {
    return { statusCode: 200, body: 'Este pago ya se había procesado.' };
  }

  const userRef = db.collection('usuarios').doc(uid);

  await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const saldoActual = userDoc.exists ? (userDoc.data().saldo || 0) : 0;
    t.set(userRef, { saldo: saldoActual + montoUSD }, { merge: true });
    t.set(pagoRef, {
      uid,
      monto: montoUSD,
      fecha: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { statusCode: 200, body: 'Saldo actualizado correctamente.' };
};

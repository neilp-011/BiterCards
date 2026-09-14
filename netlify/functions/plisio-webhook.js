// netlify/functions/plisio-webhook.js
//
// Plisio manda aquí un aviso (POST) cuando cambia el estado de un pago.
// Verificamos que el aviso sea real (usando la firma verify_hash + tu
// Llave secreta), y si el estado es "completed", le sumamos el monto
// pagado (en USD) al saldo del usuario en Firestore.

const crypto = require('crypto');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = admin.firestore();

function verificarFirma(data, secretKey) {
  const post = { ...data };
  const verifyHash = post.verify_hash;
  delete post.verify_hash;

  if (!verifyHash) return false;

  if (post.expire_utc !== undefined) post.expire_utc = String(post.expire_utc);
  if (post.tx_urls !== undefined) {
    post.tx_urls = post.tx_urls.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  }

  // Ordena las llaves alfabéticamente, como pide Plisio, y arma un string
  // al estilo PHP serialize() para que el hash coincida con el suyo.
  const sortedKeys = Object.keys(post).sort();
  const parts = sortedKeys.map((key) => {
    const val = post[key] === null || post[key] === undefined ? '' : String(post[key]);
    return `s:${key.length}:"${key}";s:${val.length}:"${val}";`;
  });
  const serialized = `a:${sortedKeys.length}:{${parts.join('')}}`;

  const computedHash = crypto.createHmac('sha1', secretKey).update(serialized).digest('hex');
  return computedHash === verifyHash;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const SECRET_KEY = process.env.PLISIO_SECRET_KEY;
    const params = new URLSearchParams(event.body);
    const data = Object.fromEntries(params.entries());

    if (!verificarFirma(data, SECRET_KEY)) {
      console.error('Firma inválida en callback de Plisio');
      return { statusCode: 403, body: 'Invalid signature' };
    }

    if (data.status !== 'completed' && data.status !== 'mismatch') {
      // Otros estados (pending, expired, error, etc.) no hacen nada por ahora.
      return { statusCode: 200, body: 'OK (sin acción)' };
    }

    // order_number viene como "uid_timestamp"
    const orderNumber = data.order_number || '';
    const uid = orderNumber.split('_')[0];
    if (!uid) {
      console.error('No se pudo extraer el uid de order_number:', orderNumber);
      return { statusCode: 400, body: 'order_number inválido' };
    }

    const paymentId = data.txn_id;
    const montoUSD = Number(data.source_amount || data.amount || 0);

    if (!paymentId || !montoUSD) {
      return { statusCode: 400, body: 'Datos de pago incompletos' };
    }

    const pagoRef = db.collection('pagos_procesados').doc(paymentId);
    const usuarioRef = db.collection('usuarios').doc(uid);

    await db.runTransaction(async (t) => {
      const pagoDoc = await t.get(pagoRef);
      if (pagoDoc.exists) {
        // Ya se procesó este pago antes; no sumar de nuevo.
        return;
      }
      const usuarioDoc = await t.get(usuarioRef);
      const saldoActual = usuarioDoc.exists && typeof usuarioDoc.data().saldo === 'number'
        ? usuarioDoc.data().saldo
        : 0;

      t.set(usuarioRef, { saldo: saldoActual + montoUSD }, { merge: true });
      t.set(pagoRef, {
        uid,
        monto: montoUSD,
        fecha: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error en plisio-webhook:', err);
    return { statusCode: 500, body: 'Error interno' };
  }
};

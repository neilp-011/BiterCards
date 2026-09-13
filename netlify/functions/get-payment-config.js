// netlify/functions/get-payment-config.js
//
// Devuelve qué sistema de recarga de saldo está activo, según la variable
// de entorno PAYMENT_SYSTEM en Netlify (solo tú puedes verla/cambiarla en
// Site configuration -> Environment variables). Valores posibles:
//   "ninguno" (o vacío) -> nadie ve el botón de recargar saldo
//   "libre"             -> el usuario escribe el monto que quiera (mínimo $5)
//   "fijo"               -> el usuario elige entre paquetes de monto fijo
//
// No expone ninguna clave secreta, solo esta palabra, así que es seguro
// que cualquier visitante la consulte.

exports.handler = async () => {
  const system = (process.env.PAYMENT_SYSTEM || 'ninguno').trim().toLowerCase();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system }),
  };
};

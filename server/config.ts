const env = process.env;
const port = Number(env.PORT || 4100);

export const config = {
  port,
  // Where buyers' browsers reach this server; PayPal sends them back here after paying.
  // Render sets RENDER_EXTERNAL_URL automatically.
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  isProduction: env.NODE_ENV === 'production',
  paypal: {
    // Sandbox only: this project never touches live money.
    apiBase: 'https://api-m.sandbox.paypal.com',
    clientId: env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? '',
  },
};

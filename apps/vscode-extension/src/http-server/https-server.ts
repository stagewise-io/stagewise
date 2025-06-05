import * as https from 'node:https';
import type * as express from 'express';
import type { CertificateData } from '../utils/certificate-manager';

export const createHttpsServer = (
  app: express.Application,
  certificates: CertificateData,
): https.Server => {
  return https.createServer(
    {
      cert: certificates.cert,
      key: certificates.key,
      // Use compatible TLS settings for local development
      secureProtocol: 'TLS_method',
      ciphers: 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA',
      honorCipherOrder: true,
      // Don't specify minVersion when using TLS_method to avoid conflicts
    },
    app,
  );
};

export const startHttpsServer = async (
  app: express.Application,
  port: number,
  certificates: CertificateData,
): Promise<https.Server> => {
  const server = createHttpsServer(app, certificates);

  return new Promise((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve(server);
      }
    });
  });
};

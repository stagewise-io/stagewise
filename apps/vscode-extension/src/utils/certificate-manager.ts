import { createCA, createCert } from 'mkcert';
import type * as vscode from 'vscode';

export interface CertificateData {
  cert: string;
  key: string;
  expires: number;
}

export class CertificateManager {
  private static readonly CERT_STORAGE_KEY = 'stagewise.https.certificates';
  private static readonly CA_STORAGE_KEY = 'stagewise.https.ca';
  private static readonly CERT_VALIDITY_DAYS = 365;

  constructor(private context: vscode.ExtensionContext) {}

  async getCertificates(): Promise<CertificateData | null> {
    try {
      const storedCerts = await this.context.secrets.get(
        CertificateManager.CERT_STORAGE_KEY,
      );
      if (!storedCerts) {
        return null;
      }

      const certData: CertificateData = JSON.parse(storedCerts);
      return certData;
    } catch (error) {
      console.error('Error retrieving certificates:', error);
      return null;
    }
  }

  async generateCertificates(): Promise<CertificateData> {
    const { cert, key } = await this.generateMkcertCertificate();
    const expires =
      Date.now() + CertificateManager.CERT_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

    const certData: CertificateData = {
      cert,
      key,
      expires,
    };

    // Store in VSCode's secure storage
    await this.context.secrets.store(
      CertificateManager.CERT_STORAGE_KEY,
      JSON.stringify(certData),
    );

    return certData;
  }

  async isValidCertificate(cert: CertificateData): Promise<boolean> {
    // Check if certificate is expired
    if (Date.now() > cert.expires) {
      return false;
    }

    // Validate certificate structure
    if (!cert.cert || !cert.key || !cert.expires) {
      return false;
    }

    try {
      // Basic validation that the cert and key are PEM formatted
      if (
        !cert.cert.includes('-----BEGIN CERTIFICATE-----') ||
        !cert.key.includes('-----BEGIN PRIVATE KEY-----')
      ) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('Certificate validation failed:', error);
      return false;
    }
  }

  async ensureValidCertificates(): Promise<CertificateData> {
    const existingCerts = await this.getCertificates();

    if (existingCerts && (await this.isValidCertificate(existingCerts))) {
      return existingCerts;
    }

    // Generate new certificates if none exist or they're invalid
    return await this.generateCertificates();
  }

  async regenerateCertificates(): Promise<CertificateData> {
    // Always generate new certificates
    return await this.generateCertificates();
  }

  private async generateMkcertCertificate(): Promise<{
    cert: string;
    key: string;
  }> {
    try {
      console.log(
        '[Stagewise] Generating self-signed certificate with mkcert...',
      );

      // Check if we have a stored CA, if not create one
      let ca: { cert: string; key: string };
      const storedCA = await this.context.secrets.get(
        CertificateManager.CA_STORAGE_KEY,
      );

      if (storedCA) {
        ca = JSON.parse(storedCA);
        console.log('[Stagewise] Using existing CA');
      } else {
        console.log('[Stagewise] Creating new Certificate Authority...');
        ca = await createCA({
          organization: 'Stagewise Development',
          countryCode: 'US',
          state: 'Local',
          locality: 'Development',
          validity: CertificateManager.CERT_VALIDITY_DAYS,
        });

        // Store the CA for future use
        await this.context.secrets.store(
          CertificateManager.CA_STORAGE_KEY,
          JSON.stringify(ca),
        );
        console.log('[Stagewise] Certificate Authority created and stored');
      }

      // Generate certificate for localhost using our CA
      const ssl = await createCert({
        ca: { key: ca.key, cert: ca.cert },
        domains: ['localhost', '127.0.0.1', '::1'],
        validity: CertificateManager.CERT_VALIDITY_DAYS,
      });

      console.log('[Stagewise] Certificate generated successfully');
      console.log(
        '[Stagewise] Note: This is a self-signed certificate. For full browser trust, consider using the system mkcert binary.',
      );

      return {
        cert: ssl.cert,
        key: ssl.key,
      };
    } catch (error) {
      console.error(
        '[Stagewise] Failed to generate certificate with mkcert:',
        error,
      );

      // Fallback to the original node-forge method if mkcert fails
      console.log(
        '[Stagewise] Falling back to node-forge certificate generation...',
      );
      return await this.generateFallbackCertificate();
    }
  }

  private async generateFallbackCertificate(): Promise<{
    cert: string;
    key: string;
  }> {
    // Import node-forge only when needed as fallback
    const forge = await import('node-forge');

    return new Promise((resolve, reject) => {
      try {
        // Generate a key pair
        const keys = forge.pki.rsa.generateKeyPair(2048);

        // Create a certificate
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(
          cert.validity.notBefore.getFullYear() + 1,
        );

        // Set subject and issuer (same for self-signed)
        const attrs = [
          { name: 'commonName', value: 'localhost' },
          { name: 'countryName', value: 'US' },
          { shortName: 'ST', value: 'Local' },
          { name: 'localityName', value: 'Development' },
          { name: 'organizationName', value: 'Stagewise Development' },
          { shortName: 'OU', value: 'Development' },
        ];

        cert.setSubject(attrs);
        cert.setIssuer(attrs);

        // Add extensions
        cert.setExtensions([
          {
            name: 'basicConstraints',
            cA: false,
          },
          {
            name: 'keyUsage',
            keyCertSign: false,
            digitalSignature: true,
            nonRepudiation: false,
            keyEncipherment: true,
            dataEncipherment: false,
          },
          {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: false,
            codeSigning: false,
            emailProtection: false,
            timeStamping: false,
          },
          {
            name: 'subjectAltName',
            altNames: [
              { type: 2, value: 'localhost' }, // DNS
              { type: 7, ip: '127.0.0.1' }, // IP
              { type: 7, ip: '::1' }, // IPv6 loopback
            ],
          },
        ]);

        // Self-sign certificate
        cert.sign(keys.privateKey, forge.md.sha256.create());

        // Convert to PEM format
        const certPem = forge.pki.certificateToPem(cert);
        const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

        resolve({
          cert: certPem,
          key: keyPem,
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

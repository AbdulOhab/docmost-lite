import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms, { StringValue } from 'ms';

@Injectable()
export class EnvironmentService {
  constructor(private configService: ConfigService) {}

  getNodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  isDevelopment(): boolean {
    return this.getNodeEnv() === 'development';
  }

  getAppUrl(): string {
    const rawUrl =
      this.configService.get<string>('APP_URL') ||
      `http://localhost:${this.getPort()}`;

    const { origin } = new URL(rawUrl);
    return origin;
  }

  isHttps(): boolean {
    const appUrl = this.configService.get<string>('APP_URL');
    try {
      const url = new URL(appUrl);
      return url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  getSubdomainHost(): string {
    return this.configService.get<string>('SUBDOMAIN_HOST');
  }

  getPort(): number {
    return parseInt(this.configService.get<string>('PORT', '3000'));
  }

  getAppSecret(): string {
    return this.configService.get<string>('APP_SECRET');
  }

  getDatabaseURL(): string {
    return this.configService.get<string>('DATABASE_URL');
  }

  getDatabaseMaxPool(): number {
    return parseInt(this.configService.get<string>('DATABASE_MAX_POOL', '10'));
  }

  getJwtTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_TOKEN_EXPIRES_IN', '90d');
  }

  getCookieExpiresIn(): Date {
    const expiresInStr = this.getJwtTokenExpiresIn();
    let msUntilExpiry: number;
    try {
      msUntilExpiry = ms(expiresInStr as StringValue);
    } catch (err) {
      msUntilExpiry = ms('90d');
    }
    return new Date(Date.now() + msUntilExpiry);
  }

  getStorageDriver(): string {
    return this.configService.get<string>('STORAGE_DRIVER', 'local');
  }

  getFileUploadSizeLimit(): string {
    return this.configService.get<string>('FILE_UPLOAD_SIZE_LIMIT', '50mb');
  }

  getFileImportSizeLimit(): string {
    return this.configService.get<string>('FILE_IMPORT_SIZE_LIMIT', '200mb');
  }

  getOwnerSeed(): {
    email: string;
    password: string;
    name: string;
    workspaceName: string;
  } | null {
    const email = this.configService.get<string>('OWNER_EMAIL');
    const password = this.configService.get<string>('OWNER_PASSWORD');
    if (!email || !password) return null;

    return {
      email,
      password,
      name: this.configService.get<string>('OWNER_NAME', 'Owner'),
      workspaceName: this.configService.get<string>(
        'OWNER_WORKSPACE_NAME',
        'My workspace',
      ),
    };
  }

  getDrawioUrl(): string {
    return this.configService.get<string>('DRAWIO_URL');
  }

  isCloud(): boolean {
    const cloudConfig = this.configService
      .get<string>('CLOUD', 'false')
      .toLowerCase();
    return cloudConfig === 'true';
  }

  isSelfHosted(): boolean {
    return !this.isCloud();
  }

  getCollabUrl(): string {
    return this.configService.get<string>('COLLAB_URL');
  }

  isBetaPublicSpaces(): boolean {
    const enabled = this.configService
      .get<string>('BETA_PUBLIC_SPACES', 'false')
      .toLowerCase();
    return enabled === 'true';
  }

  isIframeEmbedAllowed(): boolean {
    const allowed = this.configService
      .get<string>('IFRAME_EMBED_ALLOWED', 'false')
      .toLowerCase();
    return allowed === 'true';
  }

  getIframeAllowedOrigins(): string[] {
    const raw = this.configService.get<string>('IFRAME_ALLOWED_ORIGINS', '');
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  getAllowedPrivateNetworks(): string {
    return this.configService.get<string>('ALLOWED_PRIVATE_NETWORKS', 'none');
  }
}

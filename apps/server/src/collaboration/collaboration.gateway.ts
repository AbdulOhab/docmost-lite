import { Hocuspocus } from '@hocuspocus/server';
import { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { AuthenticationExtension } from './extensions/authentication.extension';
import { PersistenceExtension } from './extensions/persistence.extension';
import { Injectable } from '@nestjs/common';
import { LoggerExtension } from './extensions/logger.extension';
import { CollabWsAdapter } from './adapter/collab-ws.adapter';
import {
  CollaborationHandler,
  CollabEventHandlers,
} from './collaboration.handler';

// Hocuspocus expects a web-standard Request
const toWebRequest = (request: IncomingMessage) =>
  new Request(new URL(request.url ?? '/', 'http://localhost'), {
    method: request.method ?? 'GET',
    headers: {
      'sec-websocket-key': request.headers['sec-websocket-key'] ?? '',
      'sec-websocket-protocol':
        request.headers['sec-websocket-protocol'] ?? '',
    },
  });

@Injectable()
export class CollaborationGateway {
  private readonly hocuspocus: Hocuspocus;
  private readonly eventHandlers: CollabEventHandlers;

  constructor(
    private authenticationExtension: AuthenticationExtension,
    private persistenceExtension: PersistenceExtension,
    private loggerExtension: LoggerExtension,
    private collabEventsService: CollaborationHandler,
  ) {
    this.hocuspocus = new Hocuspocus({
      debounce: 10000,
      maxDebounce: 45000,
      unloadImmediately: false,
      extensions: [
        this.authenticationExtension,
        this.persistenceExtension,
        this.loggerExtension,
      ],
    });

    this.eventHandlers = this.collabEventsService.getHandlers(this.hocuspocus);
  }

  handleConnection(client: WebSocket, request: IncomingMessage): any {
    const clientConnection = this.hocuspocus.handleConnection(
      client,
      toWebRequest(request),
    );

    client.on('message', (data: Buffer) => {
      clientConnection.handleMessage(new Uint8Array(data));
    });

    client.on('close', (code: number, reason: Buffer) => {
      clientConnection.handleClose({ code, reason: reason.toString() });
    });
  }

  getConnectionCount() {
    return this.hocuspocus.getConnectionsCount();
  }

  getDocumentCount() {
    return this.hocuspocus.getDocumentsCount();
  }

  async handleYjsEvent<TName extends keyof CollabEventHandlers>(
    eventName: TName,
    documentName: string,
    payload: Parameters<CollabEventHandlers[TName]>[1],
    // if true, skip documents that are not currently open
    onlyIfOpen = false,
  ): Promise<ReturnType<CollabEventHandlers[TName]> extends Promise<infer R> ? R : never> {
    if (onlyIfOpen && !this.hocuspocus.documents.has(documentName)) {
      return undefined as any;
    }
    // @ts-ignore
    return this.eventHandlers[eventName](documentName, payload);
  }

  openDirectConnection(documentName: string, context?: any) {
    return this.hocuspocus.openDirectConnection(documentName, context);
  }

  async destroy(collabWsAdapter: CollabWsAdapter): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    await new Promise(async (resolve) => {
      try {
        // Wait for all documents to unload
        this.hocuspocus.configuration.extensions.push({
          async afterUnloadDocument({ instance }) {
            if (instance.getDocumentsCount() === 0) resolve('');
          },
        });

        collabWsAdapter?.close();

        if (this.hocuspocus.getDocumentsCount() === 0) resolve('');
        this.hocuspocus.closeConnections();
        this.hocuspocus.flushPendingStores();
      } catch (error) {
        console.error(error);
      }
    });

    await this.hocuspocus.hooks('onDestroy', { instance: this.hocuspocus });
  }
}

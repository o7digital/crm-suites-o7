import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ChatGptIntegrationController } from './chatgpt-integration.controller';

describe('ChatGptIntegrationController route safety', () => {
  it('exposes exactly seven external routes and every one is GET/read-only', () => {
    const prototype = ChatGptIntegrationController.prototype as any;
    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== 'constructor' && name !== 'tenantId')
      .map((name) => ({
        name,
        path: Reflect.getMetadata(PATH_METADATA, prototype[name]),
        method: Reflect.getMetadata(METHOD_METADATA, prototype[name]),
      }))
      .filter((route) => route.path !== undefined);

    expect(routes.map((route) => route.path).sort()).toEqual(
      [
        'clients',
        'deals',
        'forecast',
        'invoices',
        'pipeline',
        'summary',
        'tasks',
      ].sort(),
    );
    expect(routes.every((route) => route.method === RequestMethod.GET)).toBe(
      true,
    );
  });
});

import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

const rawClient = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

export const base44 = { ...rawClient };

base44.entities = new Proxy(rawClient.entities, {
  get(target, entityName) {
    const entity = target[entityName];
    if (!entity || typeof entity !== 'object') return entity;

    return new Proxy(entity, {
      get(entTarget, propName) {
        const origMethod = entTarget[propName];
        if (propName === 'create') {
          return async function(data) {
             if (window.__BASE44_FAMILY_ID) {
                data.family_id = window.__BASE44_FAMILY_ID;
             }
             return origMethod.call(entTarget, data);
          }
        }
        if (propName === 'bulkCreate') {
          return async function(dataArray) {
             if (window.__BASE44_FAMILY_ID) {
                dataArray.forEach(d => d.family_id = window.__BASE44_FAMILY_ID);
             }
             return origMethod.call(entTarget, dataArray);
          }
        }
        return origMethod;
      }
    });
  }
});
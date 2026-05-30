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

export const base44 = new Proxy(rawClient, {
  get(target, prop) {
    if (prop === 'entities') {
      return new Proxy(target.entities, {
        get(entTarget, entityName) {
          const entity = entTarget[entityName];
          if (!entity || typeof entity !== 'object') return entity;

          return new Proxy(entity, {
            get(innerTarget, innerProp) {
              const origMethod = innerTarget[innerProp];
              if (innerProp === 'create') {
                return async function(data) {
                   if (window.__BASE44_FAMILY_ID) {
                      data.family_id = window.__BASE44_FAMILY_ID;
                   }
                   return origMethod.call(innerTarget, data);
                }
              }
              if (innerProp === 'bulkCreate') {
                return async function(dataArray) {
                   if (window.__BASE44_FAMILY_ID) {
                      dataArray.forEach(d => d.family_id = window.__BASE44_FAMILY_ID);
                   }
                   return origMethod.call(innerTarget, dataArray);
                }
              }
              return origMethod;
            }
          });
        }
      });
    }
    const val = target[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  }
});
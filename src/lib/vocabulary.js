/** Display vocabulary selected by the locale registry. */
import { getLocaleResources } from './i18n.js';
import { localeResources } from '../locales/index.js';
const display = field => (...args) => (getLocaleResources().vocabulary[field] || localeResources.en.vocabulary[field])(...args);
export const typeName = display('typeName');
export const strategy = display('strategy');
export const notSelf = display('notSelf');
export const signature = display('signature');
export const authorityName = display('authorityName');
export const profileName = display('profileName');
export const definitionName = display('definitionName');
export const centerName = display('centerName');
export const gateName = display('gateName');
export const hexagramName = display('hexagramName');
export const channelName = display('channelName');
export const circuitName = display('circuitName');
export const planetName = display('planetName');
export const lineName = display('lineName');
export const variable = display('variable');
export const cognition = display('cognition');
export const typeDescription = display('typeDescription');

export const graphCenter = display('graphCenter');

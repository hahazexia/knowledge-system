export const isArray = Array.isArray;

export const isObject = (val: unknown) => val !== null && typeof val === 'object';

export const hasChanged = (value: any, oldValue: any): boolean => {
  return Object.is(value, oldValue);
}
// Lets any page make the logo play its loading loop while data is on its way.
let setter = () => {};
let pending = 0;

export function registerLoader(fn) {
  setter = fn;
}

export async function track(promise) {
  pending += 1;
  setter(true);
  try {
    return await promise;
  } finally {
    pending -= 1;
    if (pending === 0) setter(false);
  }
}

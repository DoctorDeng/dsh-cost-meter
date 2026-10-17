/** Keep startup in one module so parallel plugin imports cannot delay the hook behind UI dependencies. */
import { installBillionAuto } from '../lib/billion-context-auto.js'

// Cordis expects service registration to finish synchronously inside apply().
// Hold the launch observer during module loading, then hand ownership to the
// applied plugin. A metadata-only import releases its temporary observer.
const releaseLoading = installBillionAuto()
let plugin
try { plugin = await import('./index.js') }
catch (error) { releaseLoading(); throw error }
const loadingTimer = setTimeout(releaseLoading, 0)
loadingTimer.unref?.()

export const name = 'cost-meter'
export function apply(ctx) {
  clearTimeout(loadingTimer)
  const release = installBillionAuto()
  ctx.effect(() => release, 'cost-meter: original billion-context startup')
  try { plugin.apply(ctx) }
  catch (error) { release(); throw error }
  finally { releaseLoading() }
}

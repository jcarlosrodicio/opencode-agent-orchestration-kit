import { error, json } from '@sveltejs/kit'
import { browseWorkdirs } from '$lib/contexts/launch/adapters/localWorkdirBrowser.server'

export async function GET({ url }) {
  try {
    return json(await browseWorkdirs(url.searchParams.get('path') ?? undefined))
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unable to browse workdirs'
    throw error(400, message)
  }
}

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { get, set } from '../storage/kv-storage'
import { useCache } from '../cache/index'
import { JSDOM } from 'jsdom'
import { ClientGeneric } from './client'

console.info('\nWebCM, version', process.env.npm_package_version)

declare global {
  interface Event {
    payload?: any
    client?: any
  }
}

export interface ComponentSettings {
  [key: string]: any
}

type EmbedCallback = (contex: {
  parameters: { [k: string]: unknown }
  client: ClientGeneric
}) => any

type ComponentConfig = string | ComponentSettings

const EXTS = ['.ts', '.mts', '.mjs', '.js']

export class ManagerGeneric extends EventTarget {
  components: ComponentConfig[]
  trackPath: string
  name: string
  systemEventsPath: string
  sourcedScript: string
  requiredSnippets: string[]
  clientListeners: any
  registeredEmbeds: {
    [k: string]: EmbedCallback
  }
  constructor(Context: {
    components: ComponentConfig[]
    trackPath: string
    systemEventsPath: string
    // eslint-disable-next-line @typescript-eslint/ban-types
    useCache?: (key: string, callback: Function, expiry?: number) => any
  }) {
    super()
    this.sourcedScript = "console.log('WebCM script is sourced again')"
    this.requiredSnippets = ['track']
    this.registeredEmbeds = {}
    this.clientListeners = {}
    this.name = 'WebCM'
    this.trackPath = Context.trackPath
    this.systemEventsPath = Context.systemEventsPath
    this.components = Context.components
    this.initScript()
  }

  // @ts-ignore
  addEventListener(
    component: string,
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.requiredSnippets.includes(type)) {
      this.requiredSnippets.push(type)
    }
    super.addEventListener(component + '__' + type, callback, options)
  }

  async initScript() {
    for (const compConfig of this.components) {
      let component
      let componentPath = ''
      let componentName = ''
      let componentSettings = {}
      if (typeof compConfig === 'object') {
        ;[componentName] = Object.keys(compConfig)
        componentSettings = compConfig[componentName]
      } else {
        componentName = compConfig
      }
      for (const ext of EXTS) {
        componentPath = path.join(
          __dirname,
          `../components/${componentName}/index${ext}`
        )
        if (existsSync(componentPath)) {
          component =
            ext === '.mjs'
              ? await import(componentPath)
              : require(componentPath)
          break
        }
      }

      if (component) {
        try {
          console.info(':: Loading component', componentName)
          await component.default(
            new Manager(componentName, this),
            componentSettings
          )
        } catch (error) {
          console.error(
            ':: Error loading component',
            componentPath,
            component,
            error
          )
        }
      }
    }
  }

  getInjectedScript(clientGeneric: ClientGeneric) {
    let injectedScript = ''

    const clientListeners: Set<any> = new Set(
      Object.entries(clientGeneric.webcmPrefs.listeners)
        .map(x => x[1])
        .flat()
    )
    for (const snippet of [...this.requiredSnippets, ...clientListeners]) {
      const snippetPath = `browser/${snippet}.js`
      if (existsSync(snippetPath)) {
        injectedScript += readFileSync(snippetPath)
          .toString()
          .replace('TRACK_PATH', this.trackPath)
          .replace('SYSTEM_EVENTS_PATH', this.systemEventsPath)
      }
    }
    return injectedScript
  }

  async processEmbeds(response: string, client: ClientGeneric) {
    const dom = new JSDOM(response)
    for (const div of dom.window.document.querySelectorAll(
      'div[data-component-embed]'
    )) {
      const parameters = Object.fromEntries(
        Array.prototype.slice
          .call(div.attributes)
          .map(attr => [attr.nodeName.replace('data-', ''), attr.nodeValue])
      )
      const name = parameters['component-embed']
      div.innerHTML = await this.registeredEmbeds[name]({
        parameters,
        client,
      })
    }

    return dom.serialize()
  }
}

export class Manager {
  #generic: ManagerGeneric
  #component: string
  name: string

  constructor(component: string, generic: ManagerGeneric) {
    this.#generic = generic
    this.#component = component
    this.name = this.#generic.name
  }

  addEventListener(...args: any) {
    // @ts-ignore
    this.#generic.addEventListener(this.#component, ...args)
  }

  get(key: string) {
    get(this.#component + '__' + key)
  }

  set(key: string, value: any) {
    set(this.#component + '__' + key, value)
  }

  async useCache(key: string, callback: Function, expiry?: number) {
    await useCache(this.#component + '__' + key, callback, expiry)
  }

  registerEmbed(name: string, callback: EmbedCallback) {
    this.#generic.registeredEmbeds[this.#component + '__' + name] = callback
  }
}
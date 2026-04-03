const noop = () => undefined

const levels = {
  values: {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    debug: 20,
    trace: 10,
    silent: 0,
  },
  labels: {
    60: 'fatal',
    50: 'error',
    40: 'warn',
    30: 'info',
    20: 'debug',
    10: 'trace',
    0: 'silent',
  },
}

type PinoOptions = {
  level?: keyof typeof levels.values
}

class NoopLogger {
  level: keyof typeof levels.values

  constructor (opts: PinoOptions = {}) {
    this.level = opts.level ?? 'info'
  }

  child () {
    return this
  }

  trace = noop
  debug = noop
  info = noop
  warn = noop
  error = noop
  fatal = noop
  silent = noop
}

function pino (opts?: PinoOptions) {
  return new NoopLogger(opts)
}

pino.levels = levels

export { levels, pino }
export default pino

#!/usr/bin/env node
'use strict'

const pjson = require('./package.json')

const readline = require('readline')

const argv = require('yargs')
  .usage('Usage: $0 [options]')

  .describe('host', 'The host MPD listens on.')
  .default('host', process.env.MPD_HOST || 'localhost')

  .describe('port', 'The port MPD listens on.')
  .default('port', process.env.MPD_PORT || 6600)

  .describe('socket', 'The path to the Unix domain socket MPD listens on.')

  .help('help')
  .argv

const netOpts = {}
if (argv.socket == null) {
  netOpts.host = argv.host
  netOpts.port = argv.port
}
else {
  netOpts.path = argv.socket
}

const MPClient = require('.')
const mpc = new MPClient(netOpts)

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer,
})

rl.on('close', () => mpc.disconnect())
rl.on('line', (command) => {
  if (command === '') {
    rl.prompt()
  }
  else if (command.startsWith('/')) {
    if (command === '/exit') {
      rl.close()
    }
    else if (command === '/help' || command === '?') {
      console.log([
        'General:',
        '  /help       - Shows this message.',
        '  /exit       - Exits.',
        '',
        'Connection:',
        '  /connect    - Connect to the MPD server.',
        '  /disconnect - Disconnect from the MPD server.',
        '',
        'See http://www.musicpd.org/doc/protocol/command_reference.html',
        'for the full MPD command reference.',
      ].join('\n'))
      rl.prompt()
    }
    else if (command === '/connect') {
      mpc.connect().then(res => {
        console.log(trim(res))
        rl.prompt()
      }).catch(err => {
        console.error(trim(err))
        rl.prompt()
      })
    }
    else if (command == '/disconnect') {
      mpc.disconnect()
      rl.prompt()
    }
    else {
      console.error('Unknown command: "%s"', command)
      rl.prompt()
    }
  }
  else {
    mpc.command(command).then(res => {
      if (res && res.full != null) {
        console.log(trim(res.full))
      }
      rl.prompt()
    }).catch(err => {
      console.error(trim(err.full || err))
      rl.prompt()
    })
  }
})

mpc.events.on('data', (data) => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  console.log(trim(data.full || data))
  rl.prompt(true)
})

console.log('@rdcl/mpc prompt (%s)\nType "/help" for help.\n', pjson.version)
rl.setPrompt('> ')
rl.prompt()


function trim(str) {
  if (typeof(str) === 'string' && str.endsWith('\n')) {
    return str.substring(0, str.length - 1)
  }

  return str
}

function completer(line) {
  const possibilities = []

  for (const possibility of ['/help', '/connect', '/disconnect', '/exit']) {
    if (possibility.startsWith(line)) {
      possibilities.push(possibility)
    }
  }

  return [possibilities, line]
}

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

let autoidle = true

rl.on('close', () => mpc.disconnect())
rl.on('line', (command) => {
  if (command === '') {
    prompt()
  }
  else if (command.startsWith('/')) {
    const args = command.split(' ')
    command = args.shift()

    if (command === '/exit') {
      rl.close()
    }
    else if (command === '/help') {
      console.log([
        'General:',
        '  /help       - Shows this message.',
        '  /exit       - Exits.',
        '  /autoidle   - Toggles audo idle. When auto idle is active,',
        '                the idle command is sent after each command.',
        '',
        'Connection:',
        '  /connect    - Connect to the MPD server.',
        '  /disconnect - Disconnect from the MPD server.',
        '',
        'See http://www.musicpd.org/doc/protocol/command_reference.html',
        'for the full MPD command reference.',
      ].join('\n'))
      prompt()
    }
    else if (command === '/autoidle') {
      if (args.length) {
        if (args[0] === '0') {
          autoidle = false
        }
        else if (args[0] === '1') {
          autoidle = true
        }
        else {
          console.error('Invalid argument provided for /autoidle:', args)
        }
      }
      else {
        autoidle = !autoidle
      }

      console.log('Autoidle is now', autoidle ? 'on' : 'off')
      prompt()
    }
    else if (command === '/connect') {
      mpc.connect().then(res => {
        console.log(trim(res))
        prompt()
      }).catch(err => {
        console.error(trim(err))
        prompt()
      })
    }
    else if (command == '/disconnect') {
      mpc.disconnect()
      prompt()
    }
    else {
      console.error('Unknown command: "%s"', command)
      prompt()
    }
  }
  else {
    mpc.command(command).then(res => {
      if (res && res.full != null) {
        console.log(trim(res.full))
      }
      prompt()
    }).catch(err => {
      console.error(trim(err.full || err))
      prompt()
    })
  }
})

mpc.events.on('data', (data) => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  console.log(trim(data.full || data))
  prompt(true)
})

console.log(
  '@rdcl/mpc prompt (%s)\nType "/help" for help.\n',
  pjson.version
)
rl.setPrompt('> ')
prompt()


function trim(str) {
  if (typeof(str) === 'string' && str.endsWith('\n')) {
    return str.substring(0, str.length - 1)
  }

  return str
}

function prompt(preserveCursor) {
  if (autoidle) {
    mpc.command('idle')
  }

  if (preserveCursor == null) {
    rl.prompt()
  }
  else {
    rl.prompt(preserveCursor)
  }
}

function completer(line) {
  const possibilities = []

  for (const possibility of ['/help', '/connect', '/disconnect', '/exit', '/autoidle']) {
    if (possibility.startsWith(line)) {
      possibilities.push(possibility)
    }
  }

  return [possibilities, line]
}

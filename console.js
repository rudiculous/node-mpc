#!/usr/bin/env node
'use strict'

const pjson = require('./package.json')

const readline = require('readline')
const util = require('util')
const chalk = require('chalk')

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

const dummyPromise = new Promise(resolve => resolve())

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: completer,
})

let autoidle = true
let commandList = null

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
      printOut([
        'General:',
        '  /help           - Shows this message.',
        '  /exit           - Exits.',
        '  /autoidle [0|1] - Toggles audo idle. When auto idle is active,',
        '                    the idle command is sent after each command.',
        '',
        'Connection:',
        '  /connect        - Connect to the MPD server.',
        '  /disconnect     - Disconnect from the MPD server.',
        '',
        'Special commands:',
        '  /startlist      - Starts collecting commands for a command',
        '                    list.',
        '  /endlist [0|1]  - Ends collecting commands for a command list.',
        '                    Accepts one optional argument which',
        '                    specifies whether command_list_begin or',
        '                    command_list_ok_begin should be used',
        '',
        'See http://www.musicpd.org/doc/protocol/command_reference.html',
        'for the full MPD command reference.',
      ].join('\n'))
      prompt()
    }
    else if (command === '/startlist') {
      if (commandList != null) {
        printOut('Already collecting commands. End the previous list with /endlist.')
      }
      else {
        commandList = []
      }

      prompt()
    }
    else if (command === '/endlist') {
      if (commandList == null) {
        printOut('Not collecting commands. Start collecting with /startlist.')
        prompt()
      }
      else {
        mpc.commandList(commandList, !args.length || args[0] === '1').then(res => {
          if (res && res.full != null) {
            printOut(res.full)
          }
          commandList = null
          prompt()
        }).catch(err => {
          printErr(err.full || err)
          commandList = null
          prompt()
        })
      }
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
          printOut('Invalid argument provided for /autoidle:', args)
        }
      }
      else {
        autoidle = !autoidle
      }

      printOut('Autoidle is now', autoidle ? 'on' : 'off')
      prompt()
    }
    else if (command === '/connect') {
      mpc.connect().then(res => {
        printOut(res)
        prompt()
      }).catch(err => {
        printErr(err)
        prompt()
      })
    }
    else if (command == '/disconnect') {
      mpc.disconnect()
      prompt()
    }
    else {
      printOut('Unknown command: "%s"', command)
      prompt()
    }
  }
  else {
    if (commandList != null) {
      commandList.push(command)
      prompt()
    }
    else {
      mpc.command(command).then(res => {
        if (res && res.full != null) {
          printOut(res.full)
        }
        prompt()
      }).catch(err => {
        printErr(err.full || err)
        prompt()
      })
    }
  }
})

mpc.events.on('data', (data) => {
  process.stdout.clearLine()
  process.stdout.cursorTo(0)
  printOut(data.full || data)
  prompt(true)
})

console.log(
  '@rdcl/mpc prompt (%s)\nType "/help" for help.\n',
  pjson.version
)
prompt()


function printOut(message) {
  message = util.format.apply(util, arguments)

  if (message.endsWith('\n')) {
    message = message.substring(0, message.length - 1)
  }

  message = message.split('\n')
  for (let i = 0, len = message.length; i < len; i += 1) {
    if (message[i].startsWith('OK MPD')) {
      message[i] = chalk.yellow(message[i])
    }
    else if (message[i].startsWith('OK')) {
      message[i] = chalk.green(message[i])
    }
    else if (message[i].startsWith('list_OK')) {
      message[i] = chalk.cyan(message[i])
    }
    else if (message[i].startsWith('ACK')) {
      message[i] = chalk.red(message[i])
    }
  }

  message = message.join('\n')

  console.log(message)
}

function printErr(message) {
  message = util.format.apply(util, arguments)
  message = chalk.red(message)

  console.error(message)
}

function prompt(preserveCursor) {
  const promise = autoidle && mpc.isConnected()
    ? mpc.command('idle')
    : dummyPromise

  return promise
    .then(() => {
      rl.prompt.apply(rl, arguments)
    })
    .catch(err => {
      printErr(err)
      rl.prompt.apply(rl, arguments)
    })
}

function completer(line) {
  const possibilities = []
  const commands = [
    '/help',
    '/connect',
    '/disconnect',
    '/exit',
    '/autoidle',
    '/startlist',
    '/endlist',
  ]

  for (const possibility of commands) {
    if (possibility.startsWith(line)) {
      possibilities.push(possibility)
    }
  }

  return [possibilities, line]
}

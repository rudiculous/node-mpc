#!/usr/bin/env node
'use strict'

const pjson = require('./package.json')

const readline = require('readline')
const util = require('util')
const chalk = require('chalk')
const moment = require('moment')

const argv = require('yargs')
  .usage('Usage: $0 [options]')

  .boolean('timestamps')
  .describe('timestamps', 'Show timestamps')
  .default('timestamps', false)

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

const commandGroups = [
  {
    name: 'General',
    commands: ['help', 'exit', 'autoidle'],
  },
  {
    name: 'Connection',
    commands: ['connect', 'disconnect'],
  },
  {
    name: 'Special commands',
    commands: ['startlist', 'endlist'],
  },
]
const commands = {
  help: {
    description: 'Shows this message.',
    action() {
      printHelp()
      prompt()
    },
  },
  exit: {
    description: 'Exits.',
    action() {
      rl.close()
    },
  },
  autoidle: {
    description: 'Toggles audo idle. When auto idle is active, the idle command is sent after each command.',
    args: [Boolean],
    action(status) {
      autoidle = status == null
        ? !autoidle
        : status

      printOut('Autoidle is now', autoidle ? 'on' : 'off')
      prompt()
    },
  },
  connect: {
    description: 'Connect to the MPD server.',
    action() {
      mpc.connect().then(res => {
        mpc.once('end', disconnectHandler)
        printOut(res)
        prompt()
      }).catch(err => {
        printErr(err)
        prompt()
      })
    },
  },
  disconnect: {
    description: 'Disconnect from the MPD server.',
    action() {
      mpc.removeListener('end', disconnectHandler)
      mpc.disconnect()
      prompt()
    },
  },
  startlist: {
    description: 'Starts collecting commands for a command list.',
    action() {
      if (commandList != null) {
        printOut('Already collecting commands. End the previous list with /endlist.')
      }
      else {
        commandList = []
      }
      prompt()
    },
  },
  endlist: {
    description: 'Ends collecting commands for a command list. Accepts one optional argument which specifies whether command_list_begin or command_list_ok_begin should be used.',
    args: [Boolean],
    action(listOk) {
      if (commandList == null) {
        printOut('Not collecting commands. Start collecting with /startlist.')
        prompt()
      }
      else {
        const promise = listOk == null
          ? mpc.commandList(commandList)
          : mpc.commandList(commandList, listOk)

        promise.then(res => {
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
    },
  },
}

rl.on('close', () => mpc.disconnect())
rl.on('line', (command) => {
  if (command === '') {
    prompt()
  }
  else if (command.startsWith('/')) {
    const args = command.split(' ')
    command = args.shift().substring(1)
    const commandObj = commands[command]

    if (commandObj != null) {
      if (commandObj.args != null) {
        for (let i = 0, len = Math.min(commandObj.args.length, args.length); i < len; i += 1) {
          const argType = commandObj.args[i]
          let arg = args[i]

          switch (argType) {
            case Boolean:
              if (arg === '0') {
                args[i] = false
              }
              else if (arg === '1') {
                args[i] = true
              }
              else {
                printErr('Invalid argument "%s" supplied for "/%s"', arg, command)
                prompt()
                return
              }
              break;
            case Number:
              args[i] = parseFloat(arg)
              break;
          }
        }
      }
      commandObj.action.apply(commandObj, args)
    }
    else {
      printOut('Unknown command: "/%s"', command)
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

mpc.on('error', (err) => printErr('connection error:', err))
mpc.on('data', (data) => {
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


function getTimestamp() {
  if (argv.timestamps) {
    return chalk.dim('[' + moment().format('HH:mm:ss') + ']') + ' '
  }
  else {
    return ''
  }
}

function printOut(message) {
  message = util.format.apply(util, arguments)
  const timestamp = getTimestamp()

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

    message[i] = timestamp + message[i]
  }
  message = message.join('\n')

  console.log(message)
}

function printErr(message) {
  message = util.format.apply(util, arguments)
  const timestamp = getTimestamp()

  if (message.endsWith('\n')) {
    message = message.substring(0, message.length - 1)
  }

  message = message.split('\n')
  for (let i = 0, len = message.length; i < len; i += 1) {
    message[i] = timestamp + chalk.red(message[i])
  }
  message = message.join('\n')

  console.error(message)
}

function prompt(preserveCursor) {
  const promise = autoidle && mpc.isConnected()
    ? mpc.idle()
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
  const keys = Object.keys(commands)
  keys.sort()

  for (let possibility of keys) {
    possibility = '/' + possibility
    if (possibility.startsWith(line)) {
      possibilities.push(possibility)
    }
  }

  return [possibilities, line]
}

function disconnectHandler() {
  printErr('Lost connection.')
}

function printHelp() {
  let colWidth = 0

  for (const group of commandGroups) {
    for (const command of group.commands) {
      colWidth = Math.max(colWidth, 1 + command.length)
    }
  }

  for (const group of commandGroups) {
    console.log('%s:', group.name)
    for (const command of group.commands) {
      const paddedCommand = '  /' + command + Array(colWidth + 1 - command.length).join(' ') + ' - '
      const maxLen = process.stdout.columns - paddedCommand.length

      let description = commands[command].description
      let descriptionLines = []

      while (description.length > process.stdout.columns - paddedCommand.length) {
        const lastSpace = description.substring(0, maxLen).lastIndexOf(' ')

        if (lastSpace === -1) {
          descriptionLines.push(description.substring(0, maxLen))
          description = description.substring(maxLen)
        }
        else {
          descriptionLines.push(description.substring(0, lastSpace))
          description = description.substring(lastSpace + 1)
        }
      }

      if (description.length) {
        descriptionLines.push(description)
      }

      description = paddedCommand + descriptionLines.join('\n' + Array(paddedCommand.length + 1).join(' '))
      console.log(description)
    }
    console.log('')
  }

  let trailing = 'See http://www.musicpd.org/doc/protocol/command_reference.html for the full MPD command reference.'

  while (trailing.length > process.stdout.columns) {
    const lastSpace = trailing.substring(0, process.stdout.columns).lastIndexOf(' ')

    if (lastSpace === -1) {
      console.log(trailing.substring(0, process.stdout.columns))
      trailing = trailing.substring(process.stdout.columns)
    }
    else {
      console.log(trailing.substring(0, lastSpace))
      trailing = trailing.substring(lastSpace + 1)
    }
  }

  if (trailing.length) {
    console.log(trailing)
  }
}

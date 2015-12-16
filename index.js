'use strict'

const EventEmitter = require('events')
const net = require('net')

// Keys for private properties.
const $isIdle = Symbol('isIdle')
const $netOpts = Symbol('netOpts')
const $queue = Symbol('queue')

class MPClient extends EventEmitter {

  /**
   * @param {Object} netOpts Options that are passed to net.connect
   *
   * @see https://nodejs.org/api/net.html#net_net_connect_options_connectlistener
   */
  constructor(netOpts) {
    super()

    this.socket = null
    this[$isIdle] = false
    this[$netOpts] = netOpts
    this[$queue] = []
  }

  /**
   * Checks if currently connected to the MPD server.
   *
   * @return {Boolean}
   */
  isConnected() {
    return this.socket != null && this.socket.readyState !== 'closed'
  }

  /**
   * Connects to the MPD server.
   *
   * If already connected, the existing connection is ended first.
   *
   * @return {Promise}
   */
  connect() {
    return new Promise((resolve, reject) => {
      // clean up the old client
      if (this.isConnected()) {
        this.disconnect()
      }

      this.socket = net.connect(this[$netOpts], () => this.on('ready', resolve))
      this.socket.setEncoding('utf8')

      this.socket.on('end', () => this.emit('end'))
      this.socket.on('error', (err) => this.emit('error', err))

      let buffer = ''
      this.socket.on('data', (data) => {
        this[$isIdle] = false
        data = buffer + data
        buffer = ''

        let prev = 0
        let nl = 1 + data.indexOf('\n', prev)
        while (nl !== 0) {
          const line = data.substring(prev, nl)
          prev = nl
          nl = 1 + data.indexOf('\n', prev)

          const isOK = line.startsWith('OK')
          const isACK = line.startsWith('ACK')

          if (isOK || isACK) {
            if (isOK && line.startsWith('OK MPD')) {
              setImmediate(() => this.emit('ready', buffer + line))
              buffer = ''
            }
            else {
              const response = _parseResponse(buffer, line)
              buffer = ''

              if (this[$queue].length) {
                // TODO (es6): const [resolve, reject] = this[$queue].shift()
                const cbs = this[$queue].shift()
                const resolve = cbs[0]
                const reject = cbs[1]

                if (isOK) {
                  resolve(response)
                }
                else {
                  reject(response)
                }
              }
              else {
                setImmediate(() => this.emit('data', response))
              }

              if (response.data.changed != null) {
                const changed = Array.isArray(response.data.changed)
                  ? response.data.changed
                  : [response.data.changed]

                setImmediate(() => this.emit('changed', changed))
                for (const event of changed) {
                  setImmediate(() => this.emit('changed:' + event))
                }
              }
            }
          }
          else {
            buffer += line
          }
        }

        buffer += data.substring(prev)
      })
    })
  }

  /**
   * Ends the current connection.
   */
  disconnect() {
    if (this.isConnected()) {
      this.socket.end()
      this.socket = null
    }
  }

  /**
   * Sends a command to MPD and waits for an answer.
   *
   * @param {String} command
   * @return {Promise}
   *
   * @see http://www.musicpd.org/doc/protocol/command_reference.html
   */
  command(command) {
    if (!command.endsWith('\n')) {
      command += '\n'
    }

    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('No active connection to write to.'))
        return
      }

      if (this[$isIdle] && command === 'idle\n') {
        // Already idle, nothing to do.
        resolve()
        return
      }

      // TODO: Is there a possibility that this could insert commands in
      //       the queue in the wrong order?
      // TODO: Should we apply escaping to `command`?

      const that = this
      if (this[$isIdle] && command !== 'noidle\n') {
        this.socket.write('noidle\n', 'utf8', () => {
          this[$queue].push([execute, execute])
        })
      }
      else {
        execute()
      }

      function execute() {
        if (command === 'idle\n') {
          that.socket.write(command, 'utf8', () => {
            that[$isIdle] = true
            resolve()
          })
        }
        else {
          that.socket.write(command, 'utf8', () => that[$queue].push([resolve, reject]))
        }
      }
    })
  }

  /**
   * Sends a list of commands to MPD, using command_list_begin.
   *
   * @param {Array}   commands      The commands to execute.
   * @param {Boolean} [listOk=true] If true, command_list_ok_begin is used.
   * @return {Promise}
   *
   * @see http://www.musicpd.org/doc/protocol/command_lists.html
   */
  commandList(commands, listOk) {
    if (listOk == null) listOk = true

    let command = listOk ? 'command_list_ok_begin\n' : 'command_list_begin\n'
    command += Array.from(commands).join('\n') + '\n'
    command += 'command_list_end\n'

    return this.command(command)
  }

}

exports = module.exports = MPClient


/**
 * Helper function to parse MPD responses.
 *
 * @param {String} contents The response content.
 * @param {String} status   The status line at the end of the response.
 * @return {Object}
 */
function _parseResponse(contents, status) {
  let data = {}

  if (contents) {
    for (const line of contents.split('\n')) {
      if (!line) continue

      const i = line.indexOf(': ')
      if (i === -1) {
        data = {}
        break
      }

      const key = line.substring(0, i)
      const val = line.substring(i + 2)

      if (data[key] == null) {
        data[key] = val
      }
      else if (Array.isArray(data[key])) {
        data[key].push(val)
      }
      else {
        data[key] = [data[key], val]
      }
    }
  }

  return {
    data: data,
    status: status.replace('\n', ''),
    full: contents + status,
  }
}

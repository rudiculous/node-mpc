'use strict'

const net = require('net')

const expect = require('chai').expect
const MPClient = require('..')

const mockServer = getMockServer()
const mockServerInfo = mockServer.then(server => {
  const addr = server.address()
  const netOpts = {
    host: addr.address,
    port: addr.port,
  }

  return netOpts
})
const mpc = mockServerInfo.then(netOpts => {
  const mpc = new MPClient(netOpts)

  return new Promise((resolve, reject) => {
    mpc.connect()
      .then(() => resolve(mpc))
      .catch(err => reject(err))
  })
})
let nrTests = 0

describe('#MPClient', function () {

  registerTest()
  it('can connect with a TCP server', function (done) {
    mpc.then(mpc => {
      done()
      endTest()
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('can send commands to MPD', function (done) {
    mpc.then(mpc => {
      mpc.command('play').then(response => {
        expect(response).to.deep.equal({
          data: {},
          status: 'OK',
          full: 'OK\n',
        })

        done()
        endTest()
      }).catch(err => {
        done(err)
        endTest()
      })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('goes into idle mode when receiving the "idle" command', function (done) {
    this.timeout(10000)

    mpc.then(mpc => {
      mpc.once('data', data => {
        expect(data).to.deep.equal({
          data: {
            changed: ['player', 'mixer', 'database'],
          },
          status: 'OK',
          full: 'changed: player\nchanged: mixer\nchanged: database\nOK\n',
        })

        done()
        endTest()
      })

      mpc.command('idle').catch(err => {
        done(err)
        endTest()
      })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('does nothing if an "idle" command is received while already idle', function (done) {
    this.timeout(10000)

    mpc.then(mpc => {
      mpc.once('data', data => {
        done()
        endTest()
      })

      mpc.command('idle')
        .then(() => mpc.command('idle'))
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('goes out of idle mode when receiving the "noidle" command.', function (done) {
    mpc.then(mpc => {
      mpc.command('idle')
        .then(() => mpc.command('noidle'))
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'OK\n',
          })

          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('leaves idle mode when receiving a command', function (done) {
    mpc.then(mpc => {
      mpc.command('idle')
        .then(() => mpc.command('play'))
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'OK\n',
          })

          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('can send multiple commands to MPD in a command list', function (done) {
    mpc.then(mpc => {
      mpc.commandList(['play', 'play'])
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'list_OK\nlist_OK\nOK\n',
          })
        })
        .then(() => mpc.command('idle'))
        .then(() => mpc.commandList(['play', 'play'], false))
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'OK\n',
          })
        })
        .then(() => {
          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('can handle an ACK response by MPD', function (done) {
    mpc.then(mpc => {
      mpc.command('toggle')
        .then(response => {
          done(new Error('Received OK, expected ACK'))
          endTest()
        })
        .catch(err => {
          expect(err).to.deep.equal({
            data: {},
            status: 'ACK',
            full: 'ACK\n',
          })

          done()
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('can parse responses from MPD that contain data', function (done) {
    mpc.then(mpc => {
      mpc.command('status')
        .then(response => {
          expect(response).to.deep.equal({
            data: {
              'foo000': 'bar',
              'foo001': 'bar',
              'foo002': 'bar',
              'foo003': 'bar',
              'foo004': 'bar',
            },
            status: 'OK',
            full: 'foo000: bar\nfoo001: bar\nfoo002: bar\nfoo003: bar\nfoo004: bar\nOK\n',
          })

          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('can disconnect and reconnect as desired', function (done) {
    mpc.then(mpc => {
      mpc.disconnect()
      mpc.disconnect()

      mpc.connect()
        .then(() => mpc.connect())
        .then(() => {
          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('gives an error if a command is sent while not connected', function (done) {
    mpc.then(mpc => {
      mpc.disconnect()

      mpc.command('play')
        .then(response => {
          done(new Error('Received OK, expected connection error'))
          endTest()
        })
        .catch(err => expect(err.message).to.equal('No active connection to write to.'))
        .then(() => mpc.commandList('play', 'play'))
        .then(response => {
          done(new Error('Received OK, expected connection error'))
          endTest()
        })
        .catch(err => expect(err.message).to.equal('No active connection to write to.'))
        .then(() => mpc.connect())
        .then(() => {
          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

  registerTest()
  it('still gives a response if MPD gives an unexpected answer', function (done) {
    mpc.then(mpc => {
      mpc.command('statusfail')
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'foo000: bar\n\nfoo001:bar\nfoo002: bar\nOK\n',
          })

          done()
          endTest()
        })
        .catch(err => {
          done(err)
          endTest()
        })
    }).catch(err => {
      done(err)
      endTest()
    })
  })

})


function getMockServer() {
  const WRITE_NO = 0
  const WRITE_OK = 1
  const WRITE_LIST_OK = 2

  return new Promise((resolve, reject) => {
    const server = net.createServer(function handler(client) {
    })

    let idle = null
    let idleResponseNr = 0
    const idleResponses = [
        'changed: player\nchanged: mixer\nchanged: database\nOK\n',
        'changed: player\nOK\n',
    ]

    server.on('error', reject)
    server.listen(function ready() {
      resolve(server)
    })

    server.on('connection', function incoming(socket) {
      socket.write('OK MPD mock\n')
      socket.setEncoding('utf8')

      let list = null
      let listOk = null

      socket.on('data', data => {
        for (let command of data.split(/\n/)) {
          execute(command, list == null ? WRITE_OK : WRITE_NO)
        }
      })

      function execute(command, writeOk) {
        if (!command) return

        if (command === 'play') {
          if (list != null) {
            list.push(command)
          }
          else if (writeOk === WRITE_OK) {
            socket.write('OK\n')
          }
          else if (writeOk === WRITE_LIST_OK) {
            socket.write('list_OK\n')
          }
        }
        else if (command === 'idle') {
          idle = setTimeout(function () {
            idle = null
            socket.write(idleResponses[idleResponseNr])
            idleResponseNr = (idleResponseNr + 1) % idleResponses.length
          }, 500)
        }
        else if (command === 'noidle') {
          if (idle != null) {
            clearTimeout(idle)
            idle = null
          }
          socket.write('OK\n')
        }
        else if (command === 'command_list_begin') {
          list = []
          listOk = false
        }
        else if (command === 'command_list_ok_begin') {
          list = []
          listOk = true
        }
        else if (command === 'command_list_end') {
          let l = list
          list = null
          for (let command of l) {
            execute(command, listOk ? WRITE_LIST_OK : WRITE_NO)
          }
          socket.write('OK\n')
        }
        else if (command === 'status') {
          const lines = [
            'foo000: bar',
            'foo001: bar',
            'foo002: bar',
            'foo003: bar',
            'foo004: bar',
          ]

          socket.write(lines.join('\n') + '\n')
          if (writeOk === WRITE_OK) {
            socket.write('OK\n')
          }
          else if (writeOk === WRITE_LIST_OK) {
            socket.write('list_OK\n')
          }
        }
        else if (command === 'statusfail') {
          const lines = [
            'foo000: bar',
            '',
            'foo001:bar',
            'foo002: bar',
          ]

          socket.write(lines.join('\n') + '\n')
          if (writeOk === WRITE_OK) {
            socket.write('OK\n')
          }
          else if (writeOk === WRITE_LIST_OK) {
            socket.write('list_OK\n')
          }
        }
        else {
          socket.write('ACK\n')
        }
      }
    })
  })
}

function registerTest() {
  nrTests += 1
}

function endTest() {
  nrTests -= 1

  if (nrTests < 1) {
    console.log('All tests have been completed, closing the mock server.')
    mpc.then(mpc => mpc.disconnect())
    mockServer.then(server => server.close())
  }
}

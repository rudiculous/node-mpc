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
    })
  })

  registerTest()
  it('can send commands to MPD', function (done) {
    mpc.then(mpc => {
      mpc.command('play')
        .then(response => {
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'OK\n',
          })

          done()
          endTest()
        })
    })
  })

  registerTest()
  it('can handle an ACK response by MPD', function (done) {
    mpc.then(mpc => {
      mpc.command('toggle')
        .catch(err => {
          expect(err).to.deep.equal({
            data: {},
            status: 'ACK',
            full: 'ACK\n',
          })

          done()
          endTest()
        })
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
    })
  })

  registerTest()
  it('can disconnect and reconnect as desired', function (done) {
    mpc.then(mpc => {
      mpc.disconnect()
      mpc.disconnect()

      mpc.connect()
        .then(() => {
          mpc.connect()
            .then(() => {
              done()
              endTest()
            })
        })
    })
  })

  registerTest()
  it('gives an error if a command is sent while not connected', function (done) {
    mpc.then(mpc => {
      mpc.disconnect()

      mpc.command('play')
        .catch(err => {
          expect(err.message).to.equal('No active connection to write to.')

          mpc.connect()
            .then(() => {
              done()
              endTest()
            })
        })
    })
  })

  registerTest()
  it('still gives a response if MPD gives an unexpected answer', function (done) {
    mpc.then(mpc => {
      mpc.command('statusfail')
        .then(response => {
          console.log(response)
          expect(response).to.deep.equal({
            data: {},
            status: 'OK',
            full: 'foo000: bar\n\nfoo001:bar\nfoo002: bar\nOK\n',
          })

          done()
          endTest()
        })
    })
  })

})


function getMockServer() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(function handler(client) {
    })

    server.on('error', reject)
    server.listen(function ready() {
      resolve(server)
    })

    server.on('connection', function incoming(socket) {
      socket.write('OK MPD mock\n')
      socket.setEncoding('utf8')

      socket.on('data', data => {
        if (data === 'play\n') {
          socket.write('OK\n')
        }
        else if (data == 'status\n') {
          const lines = [
            'foo000: bar',
            'foo001: bar',
            'foo002: bar',
            'foo003: bar',
            'foo004: bar',
          ]

          socket.write(lines.join('\n') + '\nOK\n')
        }
        else if (data == 'statusfail\n') {
          const lines = [
            'foo000: bar',
            '',
            'foo001:bar',
            'foo002: bar',
          ]

          socket.write(lines.join('\n') + '\nOK\n')
        }
        else {
          socket.write('ACK\n')
        }
      })
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
    mpc.disonnect()
    mockServer.then(server => server.close())
  }
}

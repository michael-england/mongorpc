const request = require('superagent');
const expect = require('expect.js');
const fs = require('fs');
const db = require('../lib/db');
var before = require('mocha').before;
var it = require('mocha').it;
var describe = require('mocha').describe;

var sessionCookie;
var _id;
var tests = fs.readdirSync('./test/server').map((fileName) => {
	return require('./server/' + fileName);
}).sort((a, b) => {
	return a.order - b.order;
});

describe('Load Static File', () => {
	it('Index.html can be loaded.', (done) => {
		request.get('http://localhost:3000' + '/index.html').end((error, response) => {
			expect(response.status).to.equal(200);
			expect(response.text).to.contain('Backrest');
			done();
		});
	});
});

describe('API', () => {
	before((done) => {
		// connect to the database and remove existing test user
		db.collection('users').remove({
			'email': {
				'$in': ['emailCreate@backrest.io', 'emailUpdate@backrest.io']
			}
		}, () => {
			done();
		});
	});

	// loop through each test
	tests.forEach((test) => {

		if (test.before) {
			test.before();
		}

		it(test.description, function (done) {
			this.timeout(5000);
			setTimeout(() => {
				var method = test.method.toLowerCase();
				if (method === 'delete') {
					method = 'del';
				}

				var call = request[method]('http://localhost:3000' + test.url.replace('{_id}', _id));

				// add cookies
				if (sessionCookie) {
					call = call.set('Cookie', sessionCookie);
				}

				// add data
				if (test.method === 'POST' || test.method === 'PUT') {
					if (test.data) {
						var type = Object.prototype.toString.call(test.data);
						if (type === '[object Function]') {
							call = call.send(test.data(_id))
						} else {
							call = call.send(test.data);
						}
					}
				}

				call.end((error, response) => {
					// remember cookies
					if (response.header['set-cookie']) {
						sessionCookie = response.header['set-cookie'];
					}

					// basic call assertions
					expect(response.status).to.equal(test.statusCode || 200);

					// append id to user
					if (response.body._id) {
						_id = response.body._id;
					}

					// check assertions
					if (!test.assertions) {
						return done();
					}

					var type = Object.prototype.toString.call(test.assertions);
					if (type === '[object Array]') {
						test.assertions.forEach((assertion) => {
							expect(response.body[assertion]).to.equal(test.body[assertion]);
						});
						done();
					} else if (type === '[object Function]') {
						test.assertions(response.body, done);
					} else {
						done();
					}
				});
			}, test.delay);
		});

		if (test.after) {
			test.after();
		}
	});
});
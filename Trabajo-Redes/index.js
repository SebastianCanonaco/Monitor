const express = require('express');
const app = express();
const net = require('net')
const url = require('url')
const dns = require('dns')
var ping = require('ping');
var cmd = require('node-cmd')
const portScanner = require('portscanner')
const fs = require('fs'),
    path = require('path'),    
    filePathAvailability = path.join(__dirname, 'availability.html'),
    filePathHosts = path.join(__dirname, 'availability-2.html'),
    filePathIndex = path.join(__dirname, 'index.html'),
    filePathMail = path.join(__dirname, 'mail.html'),
    filePathDns = path.join(__dirname, 'dns.html');

const DNS_DEFAULT_SERVERS = dns.getServers()
const MAIL_PORT = 25
const PORT_HTTP = 9090


app.listen(PORT_HTTP, () => {
    console.log('Listening on ' + PORT_HTTP)
})
/***************************INDEX*****************************/
app.get('/', (request, response) => {
	var ret = fs.readFileSync(filePathIndex, {encoding: 'utf-8'})
	response.end(ret)
})
/***********************************************************/

/*********************MAIL-SERVER-MONITOR********************/
app.get('/mail', (request, response) => {
	var urlObj = url.parse(request.url, true)
	var array_mail_servers = urlObj.query.mail_servers.split(',')
	var mail_server_obj = []
	var count = array_mail_servers.length

	dns.setServers(['8.8.8.8'])
	array_mail_servers.forEach((mail_server) => {
		var ip_ms
		dns.resolve(mail_server, (err, records) => {
			if(!err){
				ip_ms = records
				console.log(records)
			}
			else
				console.log(err)
		})  
        var socketMail = new net.Socket()
		/*socketMail.setTimeout(5000)
		socketMail.on('timeout', () => {
			mail_server_obj.push({
					mail_server: mail_server,
					ip: ip_ms,
					mail_data: 'TIMEOUT',
					status: '-'
			})
  			console.log('socket timeout')
  			socketMail.end();
  			count--
  			if(count == 0) {
				respuestaMail()
  			}
		})*/
		socketMail.connect(MAIL_PORT, mail_server, () => {
			socketMail.on('data', (data) => {
				console.log('  ' + data.toString())
				data = data.toString()
				mail_server_obj.push({
					mail_server: mail_server,
					ip: ip_ms,
					mail_data: data,
					status: data.split(' ')[0]
				})
				//console.log(mail_server_obj)
				socketMail.end()
				count--
				if(count == 0)
					respuestaMail()
			})

			socketMail.on('error', (error) => {
				console.log('error')
				socketMail.end()
				count--
				if(count == 0)
					respuestaMail()				
			})
		})

/*		socketMail.on('data', (data) => {
			console.log("data123 " + data)
		})
*/
		socketMail.on('error', (error) => {
			mail_server_obj.push({
				mail_server: mail_server,
				ip: 'undefined',
				mail_data: error,
				status: 404
			})
			socketMail.end()
			count--
			if(count == 0)
				respuestaMail()			
		})
	})
	
	function respuestaMail(){
		response.end(armarHTMLMail(mail_server_obj))
	}
})

function armarHTMLMail(arreglo_mails){
	var ret = fs.readFileSync(filePathMail, {encoding: 'utf-8'})
	arreglo_mails.forEach((element) => {
		ret += `<tr><th scope="row">${element.mail_server}</th><td>${element.ip}</td><td>${element.status}</td>
		<td>${element.mail_data}</td></tr>`
	})

	ret += '</tbody></table></div></div></body></html>'
	return ret
}

/***********************************************************/

/*************************DNS-MONITOR***********************/
app.get('/dns', (request, response) => {
	var urlObj = url.parse(request.url, true) 
	var domain = urlObj.query.domain

	var array_domain_ips = urlObj.query.ips.split(',')
	var dns_servers = urlObj.query.dns_servers.split(',')
	
	var host_records = []
	var ip_records = []

	var domain_soa

	/*var s = new net.Socket()
	s.connect(80,'172.217.28.164',() => {
		s.write('GET /\n')
		s.on('data',(data) => {
			data = data.toString()
			data = data.split('<!')
			console.log('DATA: ' + data[0])
		})	
	})*/



	console.log(dns_servers)
	if(dns_servers[0] != '')
		dns.setServers(dns_servers)
	dns_servers = dns.getServers()

	dns.resolve4(domain,{ttl:true}, (err, records) => {
		if(err){
			console.log(err)
		} else {
			records.forEach((record) => {
				host_records.push({
				type : 'A',
				value : record.address,
				details : 'ttl: ' + record.ttl
				})
			})
			
		}
	})

	dns.resolve6(domain,{ttl:true}, (err, records) => {
		if(err){
			console.log(err)
		} else {
			records.forEach((record) => {
				host_records.push({
				type : 'AAAA',
				value : record.address,
				details : 'ttl: ' + record.ttl
				})
			})			
			
		}
	})

	dns.resolveNs(domain, (err, records) => {
		if(err){
			console.log(err)
		} else {
			records.forEach((record) => {
				dns.resolve4(record, (err, addresses) => {
					host_records.push({
					type : 'NS',
					value : record,
					details : 'IPv4: ' + addresses
					})
				})
				
			})
			
		}
	})

	dns.resolveMx(domain,{ttl:true}, (err, records) => {
		if(err){
			console.log(err)
		} else {
			records.forEach((record) => {
				host_records.push({
				type : 'MX',
				value : record.exchange,
				details : 'priority: ' + record.priority
				})
			})
			
		}
	})

	dns.resolveSoa(domain, (err, add) => {
		if(err){
			console.log(err)
		} else {
			domain_soa = add.serial
			host_records.push({
				type : 'SOA',
				value : 'Serial: ' + add.serial,
				details : 'NS name: ' + add.nsname + '\nHost master: ' + add.hostmaster + '\nRefresh: ' + add.refresh +
							'\nRetry: ' + add.retry + '\nExpire: ' + add.expire + '\nMin TLL: ' + add.minttl
				})
			}
		if(array_domain_ips[0] != '')	
			checkIps()
	})

	function checkIps(){
		array_domain_ips.forEach((ip) => {
			dns.reverse(ip, (err, hostnames) => {
				console.log(hostnames)
				hostnames.forEach((host_name) => {
					let ip_obj = {
						ip: ip,
						domain: host_name,
						serial: 'undefined',
						match: 'undefined',
						details: 'undefined'
					}
					dns.resolveSoa(host_name, (err, record) => {
						if(!err){
							console.log("SOAAA" + record)
							ip_obj.match = (domain_soa == record.serial)
							ip_obj.details = (domain_soa == record.serial) ? 'SOA record match' : 'SOA record does not match'
							ip_obj.serial = record.serial
						} else {
							console.log(err)
							ip_obj.match = false
							ip_obj.details = 'ERROR SOA RECORD NOT FOUND'
						}
						ip_records.push(ip_obj)
						console.log(ip_records)
					})	
				})	
			})
		})
	}

	setTimeout(() => {
		/*process.stdout.write('\033c');*///clear screen
		response.end(armarHTMLDns(host_records, ip_records, domain, dns_servers))
	}, 2500)
})

function armarHTMLDns(arreglo_dns, arreglo_ips,domain, dns_servers){
	var ret = fs.readFileSync(filePathDns, {encoding: 'utf-8'})
	ret += `<div class="bg-dark"><span class="h3 text-warning">Domain: ${domain}</span></div>`
	ret += `<div class="bg-dark"><span class="h3 text-warning">DNS Servers: ${dns_servers}</span></div>`
	ret += `<table class="table table-warning h5">
	  			<thead class="bg-warning">
			        <tr>
			          <th scope="col">Record</th>
			          <th scope="col">Value</th>
			          <th scope="col">Details</th>
			        </tr>
	  			</thead>
	  			<tbody>`
	arreglo_dns.forEach((element) => {
		ret += `<tr><td>${element.type}</td><td>${element.value}</td><td style="white-space: pre-line">${element.details}</td></tr>`
	})

	ret += '</tbody></table></div></div></body></html>'
	ret +=`	<table class="table table-warning h5">
	  			<thead class="bg-warning">
			        <tr>
			          <th scope="col">IP</th>
			          <th scope="col">Domain</th>
			          <th scope="col">SOA Serial</th>
			          <th scope="col">Details</th>
			        </tr>
	  			</thead>
	  			<tbody>`
	arreglo_ips.forEach((element) => {
		let color
		(element.match) ? color = 'bg-success' : color = 'bg-danger' 
		ret += `<tr class="${color}"><td>${element.ip}</td><td>${element.domain}</td><td>${element.serial}</td><td>${element.details}</td></tr>`
	})
	return ret
}

/***********************************************************/


/*************************AVAILABILITY************************/
/*var portInUse = function(port, callback) {
	var server = net.createServer(function(socket) {
		socket.write('Echo server\r\n');
		socket.pipe(socket)
	})

    server.listen(port, '127.0.0.1')
    server.on('error', function (e) {
		callback(true)
    })
    server.on('listening', function (e) {
		server.close()
		callback(false)
    })
}*/


app.get('/availability', (request, response) => {
	
	var respuesta = ""
	var urlObj = url.parse(request.url, true)
	var hostsToPing = urlObj.query.devices.split(',') 
	var ipPort = urlObj.query.ip_ports.split(',')
	var ipPortArray = []
	var pingedHosts = []


	if(ipPort[0] != ''){
		ipPort.forEach((ipPortElement) => {
			let singleHostPort = ipPortElement.split(':')
			let element = {
				host : singleHostPort[0],
				port : singleHostPort[1],
				status : 'undefined1'
			}
			ipPortArray.push(element)
		})

	
		ipPortArray.forEach((element) => {
			portScanner.checkPortStatus(element.port, element.host,(error, status) => {
			if(!error){
				element.status = (status == 'open') ? 'Already in use' : 'Not in use'
	  			console.log('PORT: ' + element.port + " status: " + element.status)
			}
	  		else
	  			console.log(error)
			})
		})
	}


	hostsToPing.forEach((host) => {
		cmd.get(`ping ${host}`, (err, data, stderr) => {
	        if (!err) {
	           console.log(data)
	        } else {
	           console.log('error')
	        }
    	})
    	ping.promise.probe(host)
        .then((res) => {
            console.log('Host: ' + res.host + ' | IP: ' + res.numeric_host + ' | alive: ' + res.alive + ' | avg time: ' + res.avg + '\n')
            pingedHosts.push(res)
        })
    })

	setTimeout(() => {
		response.end(armarHTMLAvailability(ipPortArray, pingedHosts))
	}, 3000)
	
})

function armarHTMLAvailability(arreglo_ports, arreglo_hosts){
	var ret = fs.readFileSync(filePathAvailability, {encoding: 'utf-8'})
	arreglo_ports.forEach((element) => {
		ret += `<tr><th scope="row">${element.host}</th><td>${element.port}</td><td>${element.status}</td></tr>`
	})
	ret += '</tbody></table></div></div>'

	var ret2 = fs.readFileSync(filePathHosts, {encoding: 'utf-8'})
	ret += ret2
	arreglo_hosts.forEach((element) => {
		ret += `<tr><th scope="row">${element.host}</th><td>${element.numeric_host}</td><td>${element.alive}</td>
		<td>${element.min}</td><td>${element.max}</td><td>${element.avg}</td></tr>`
	})
	ret += '</tbody></table></div></div></body></html>'
	return ret
}
/***********************************************************/

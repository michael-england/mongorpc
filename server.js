var mongo = require("mongojs");
var http = require("http");
var libpath = require("path");
var fs = require("fs");
var url = require("url");
var mime = require("mime");
var currentCollection = null;
var currentMethod = null;
var currentRequest = null;
var currentResponse = null;
var currentValidationSummary = null;
var currentId = null;
var filename = null;
var path = ".";
var settings = null;
var collections = null;
var db = null;

var settingsFilename = libpath.join(path, "settings.json");
libpath.exists(settingsFilename, libpathExists_Settings);

function libpathExists_Settings(exists) {
    if (exists) {
	    fs.readFile(settingsFilename, "binary", fsReadFile_Settings);
    } else {    

		// handel error
		console.log("settings.json file does not exist.");

		// exit the application    		
		process.exit();	
    }
}

function fsReadFile_Settings(error, file) {
	if (!error) {
    	try
    	{
    		// parse file to settings object
    		settings = JSON.parse(file);
    		
    		// push setting's collection to collections name array
    		collections = new Array();
			for (var i = 0; i < settings.collections.length; i++) {
				collections.push(settings.collections[i].name)
			}    		
			
			// connect to the database
    		db = mongo.connect(settings.databaseUrl, collections);
       	}
    	catch (ex)
    	{
    		// handel error
    		console.log(ex.message);

			// exit the application    		
    		process.exit();	
    	}
    } else {
    
		// exit the application    		
		process.exit();	
    	
	}
}

http.createServer(function (request, response) {
  	currentResponse = response;
  	currentRequest = request;
  	
  	// process POST request
  	if (currentRequest.method == "POST") {	
  		
  		// load chunks into data
  		var data = "";
  		currentRequest.on("data", function (chunk) {
			data += chunk;
		});
  		
  		// chucks have loaded, continue the request
	    currentRequest.on("end", function requestEnd() {
    
	  		var json = null;
	  		try {
	  		
	  			// parse data to json
	  			json = JSON.parse(data);
	  			currentMethod = json.method;
	  			currentId = json.id;
	  			
	  		} catch (error) {
		  		
		  		// data failed to parse, create parse error response
		  		json = {
		  			"jsonrpc": "2.0", 
		  			"error": {
		  				"code": -32700, 
		  				"message": "Parse error"
		  			}, 
		  			"id": null
		  		};
	  			
	  			// respond with parse error 
	  			currentResponse.writeHead(200, {"Content-Type": "application/json"});
	  			currentResponse.write(json);
		  		currentResponse.end();
	  			return;
	  		}
	    
	    	try {
			  	var pathParts = currentRequest.url.split("/");
			  	currentCollection = pathParts[pathParts.length - 1];
			  	if (currentCollection != null && currentCollection != undefined) {
			  		
					var isValid = true;
					var command = undefined;
					if (json.method == "update") {
					
						// filter the query
						json.params[0] = filter(json.params[0], "find");
						
						// filter the update
						json.params[1] = filter(json.params[1], "update");
						
						// validate
				  		if (validate(currentCollection, "find", json.params[0]) && 
				  			validate(currentCollection, "findAndModify", json.params[1])) {
				  		
				  			var params = "";
				  			for (var i = 0; i < json.params.length; i++) {
				  				if (i == 0)
				  					params += JSON.stringify(json.params[i]);
				  				else
				  					params += ", " + JSON.stringify(json.params[i]);
				  				
				  			}
				  		
				  			// create the command
				  			command = "db." + currentCollection + "." + json.method + "(" + params + ", dbResult);";
				  		
				  		} 
					} else if (json.method == "findAndModify") {
					
						// filter the query
						json.params.query = filter(json.params.query, "find");
						
						// filter the update
						json.params.update = filter(json.params.update, "update");
						
						// validate
				  		if (validate(currentCollection, "find", json.params.query) && 
				  			validate(currentCollection, "findAndModify", json.params.update)) {
				  		
				  			// create the command
				  			command = "db." + currentCollection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);";
				  		} 
					} else {
					
						// filter the params
						json.params = filter(json.params, json.method);
					
				  		if (validate(currentCollection, json.method, json.params)) {
				  		
				  			// create the command
				  			command = "db." + currentCollection + "." + json.method + "(" + JSON.stringify(json.params) + ", dbResult);";
				  		} 
					}

					if (isValid) {
				
			  			// write command to log
			  			console.log(command);
			  		
			  			// execute command
			  			eval(command)
					} else {
						
						var json = {
				  			"jsonrpc": "2.0", 
				  			"result": currentValidationSummary, 
				  			"error": {
				  				"code": -32603, 
				  				"message": "Internal JSON-RPC error."
				  			}, 
				  			"id": currentId
				  		};
				  		
				  		// respond with procedure not found
				  		currentResponse.writeHead(200, {"Content-Type": "application/json"});
		        		currentResponse.write(JSON.stringify(json));
					  	currentResponse.end();
			  		} 
			  	} else {
			  	
			  		// collection not provided, create procedure not found response
			  		var json = {
			  			"jsonrpc": "2.0", 
			  			"error": {
			  				"code": -32601, 
			  				"message": "Procedure not found."
			  			}, 
			  			"id": currentId
			  		};
			  		
			  		// respond with procedure not found
			  		currentResponse.writeHead(200, {"Content-Type": "application/json"});
		        	currentResponse.write(JSON.stringify(json));
				  	currentResponse.end();
				  	return;
			  	}
		  	} catch (error) {
	
			  	// Internal error occured, create internal error response
		  		var json = {
		  			"jsonrpc": "2.0", 
		  			"error": {
		  				"code": -32603, 
		  				"message": "Internal JSON-RPC error."
		  			}, 
		  			"id": currentId
		  		};
		  		
		        currentResponse.writeHead(200, {"Content-Type": "application/json" });
		        currentResponse.write(JSON.stringify(json));
		        currentResponse.end();		  		
		  	}
		});
    } else {
    	var uri = url.parse(request.url).pathname;
    	if (uri.indexOf("settings.json", 0) < 0) {
	       	filename = libpath.join(path, uri);
		    libpath.exists(filename, libpathExists);
	    } else {		    
	        currentResponse.writeHead(404, {"Content-Type": "text/plain" });
	        currentResponse.write("404 Not Found\n");
	        currentResponse.end();
	    }
	}    
    
}).listen(1337, "127.0.0.1");

function filter(params, method) {

	// filter out param values
	var filterMode = "field";
	var filters = getFilters(currentCollection, method, "in");
	var fieldFiltered = new Array();
	var fieldAllowed = new Array();
	for (var i = 0; i < filters.length; i++) {
		if (filters[i].fieldToFilter == "*") {
			if (filters[i].allowed == false) {
				filterMode = "allowNone";
			} else {
				filterMode = "allowAll";
			}
		} else {
			if (filters[i].allowed) {
				fieldAllowed.push(filters[i].fieldToFilter);
			} else {
				fieldFiltered.push(filters[i].fieldToFilter);
			}
		}
	}
	
	// filter based on mode
	switch (filterMode) {
		case "allowAll": // allow all params except the filtered ones
			for (var i = 0; i < fieldFiltered.length; i++) {
				params[fieldFiltered] = undefined;
			}
			break;
			
		case "allowNone": // excluded all params except the allowed ones
			for (var key in params) {
				if (fieldAllowed.indexOf(key) == -1) {
					params[key] = undefined;
				}
			}
			break;
		
		case "field": // filter on a field basis
			for (var i = 0; i < filters.length; i++) {
				if (filters[i].allowed == false) {
					params[filters[i].fieldToFilter] = undefined;
				}							
			}
			break;
	}
	
	return params;
}

function validate(collection, method, params) {

	var validationSummary = new Array();
	var validatorGroups = getValidatorGroups(collection, method);
	if (validatorGroups.length > 0) {
		for (var i = 0; i < validatorGroups.length; i++) {
			var validators = getValidatorsByGroup(collection, method, validatorGroups[i]);			
			validationSummary = validateGroup(validators, params);
			if (validationSummary.length == 0)
				break;
		}
	} else {
		var validators = getValidators(collection, method);
		validationSummary = validateGroup(validators, params);
	}
	
	if (validationSummary.length > 0) {
		currentValidationSummary = validationSummary;
		return false;
	} else {
		return true;
	}
}

function validateGroup(validators, params) {
	var validationSummary = new Array();

	for (var i = 0; i < validators.length; i++) {
		// get the value from params
		var value = getParamValue(params, validators[i].fieldToValidate);
		switch (validators[i].type) {
			case "required":
				if (value == "" || value == null) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != null) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " is required.");
					}
				}
				break; 
			
			case "compare":
				var valueCompare = null;
				var valid = true;
				
				if (validators[i].fieldToCompare != null && validators[i].fieldToCompare != "")
					valueCompare = getParamValue(params, validators[i].fieldToCompare);			
				else if (validators[i].valueToCompare != null)
					valueCompare = validators[i].valueToCompare;		
					
				switch (validators[i].dataType) {
					case "string":
						value = value.toString();
						valueCompare = valueCompare.toString();
						break;
					
					case "integer":
						value = parseInt(valueCompare);
						valueCompare = parseInt(value);
						break;
					
					case "float":
						value = parseFloat(valueCompare);
						valueCompare = parseFloat(value);
						break;
					
					case "date":
						value = Date.parse(value);
						valueCompare = Date.parse(valueCompare);
						break;
						
					case "currency":
						value = Number(value.replace(/[^0-9\.]+/g,""));
						valueCompare = Number(valueCompare.replace(/[^0-9\.]+/g,""));
						break;				
				}
				
				if (validators[i].operator != null && validators[i].operator != "") {
					valid = eval("(value " + validators[i].operator + " valueCompare)");	
				} else {
					valid = eval("(value == valueCompare)");
				}
				
				if (valid) {
					if (validators[i].errorMessage != "" && 
						validators[i].errorMessage != null) {
						validationSummary.push(validators[i].errorMessage);
					} else {
						validationSummary.push(validators[i].fieldToValidate + " failed to compare.");
					}
				}
				break;
				
			case "range":
				if (value != "" && value != null) {
					var minimumValue = new Number(validators[i].minimumValue);
					var maximumValue = new Number(validators[i].maximumValue);
					var value = new Number(value);
					
					if (value < minimumValue || value > maximumValue) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != null) {
							validationSummary.push(validators[i].errorMessage);
						} else {
							validationSummary.push(validators[i].fieldToValidate + " is required.");
						}
					}
				}
				break;
				
			case "regularExpression":
				if (value != "" && value != null) {
					var regularExpression = new RegExp(unescape(validators[i].expression));
					if (value.match(regularExpression) == null) {
						if (validators[i].errorMessage != "" && 
							validators[i].errorMessage != null) {
							validationSummary.push(validators[i].errorMessage);
						} else {
							validationSummary.push(validators[i].fieldToValidate + " is invalid.");
						}
					}
				}
				break;
				
			case "custom":
				break;
		}
	}
	
	return validationSummary;
}

function getParamValue(params, name){
	try {
		return eval("(params." + name + ")");
	} catch (error) {
		return null;
	}
}

function getValidatorGroups(collection, method) {
	var validatorGroups = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				if (settings.collections[i].validators[n].groups != undefined) {				
					var hasFunction = false;
					for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
						if (settings.collections[i].validators[n].functions[f] == method) {
							hasFunction = true;
							break;
						}
					}
					
					if (hasFunction)
						for (var f = 0; f < settings.collections[i].validators[n].groups.length; f++) {
							if (settings.collections[i].validators[n].groups[f] != "*")
								if (validatorGroups.indexOf(settings.collections[i].validators[n].groups[f]) == -1)
									validatorGroups.push(settings.collections[i].validators[n].groups[f]);	
				
					}
				}	
			}
		}
	}	
	return validatorGroups;
}

function getValidators(collection, method) {
	var validators = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
					if (settings.collections[i].validators[n].functions[f] == method) {
						validators.push(settings.collections[i].validators[n]);
						break;
					}
				}
			}
		}
		break;
	}	
	return validators;
}

function getValidatorsByGroup(collection, method, group) {
	var validators = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			for (var n = 0; n < settings.collections[i].validators.length; n++) {
				if (settings.collections[i].validators[n].groups != undefined) {		
					if (settings.collections[i].validators[n].groups.indexOf(group) != -1 ||
						settings.collections[i].validators[n].groups.indexOf("*") != -1) {
						for (var f = 0; f < settings.collections[i].validators[n].functions.length; f++) {
							if (settings.collections[i].validators[n].functions[f] == method) {
								validators.push(settings.collections[i].validators[n]);
								break;
							}
						}
					}
				}
			}
		}
		break;
	}	
	return validators;
}

function getFilters(collection, method, direction) {
	var filters = new Array();
	for (var i = 0; i < settings.collections.length; i++) {
		if (settings.collections[i].name == collection) {
			if (settings.collections[i].filters != undefined) {
				for (var n = 0; n < settings.collections[i].filters.length; n++) {
					if (settings.collections[i].filters[n].direction == direction) {
						for (var f = 0; f < settings.collections[i].filters[n].functions.length; f++) {
							if (settings.collections[i].filters[n].functions[f] == method) {
								filters.push(settings.collections[i].filters[n]);
								break;
							}
						}
					}
				}
			}
		}
		break;
	}	
	return filters;
}

function libpathExists(exists) {
    if (!exists) {
        currentResponse.writeHead(404, {"Content-Type": "text/plain" });
        currentResponse.write("404 Not Found\n");
        currentResponse.end();
        return;
    }

    if (fs.statSync(filename).isDirectory()) {
        filename += "/index.html";
    }

    fs.readFile(filename, "binary", fsReadFile);
}

function fsReadFile(error, file) {
	if (error) {
        currentResponse.writeHead(500, {"Content-Type": "text/plain" });
        currentResponse.write(error + "\n");
        currentResponse.end();
        return;
    } else {
	    var type = mime.lookup(filename);
	    currentResponse.writeHead(200, { "Content-Type": type });
	    currentResponse.write(file, "binary");
	    currentResponse.end();
	}
}

function dbResult(error, result) {
	if(error) {
		var json = {
  			"jsonrpc": "2.0", 
  			"result": null, 
  			"error": {
  				"code": -32603, 
  				"message": "Internal JSON-RPC error."
  			}, 
  			"id": currentId
  		};
	} else {
	
		// filter out return values
		var filters = getFilters(currentCollection, currentMethod, "out");
		for (var i = 0; i < filters.length; i++) {
			if (filters[i].allowed == false) {
				if (result instanceof Array) {
					for (var n = 0; n < result.length; n++) {
						result[n][filters[i].fieldToFilter] = undefined;
					}
				} else {
					result[filters[i].fieldToFilter] = undefined;
				}
			}
		}
	
  		var json = {
  			"jsonrpc": "2.0", 
  			"result": result, 
  			"id": currentId
  		};
  		currentResponse.writeHead(200, {"Content-Type": "application/json"});
	  	currentResponse.end(JSON.stringify(json));
	}
}

console.log("Server running at http://127.0.0.1:1337/");
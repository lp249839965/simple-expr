(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * This parser was built from <https://github.com/thejameskyle/the-super-tiny-compiler>
 */

function tokenizer(input) {
  let current = 0;

  let tokens = [];

  while (current < input.length) {
    let char = input[current];

    if (char === '(') {
      tokens.push({
        type: 'paren',
        value: '(',
      });
      current++;
      continue;
    }
    if (char === ')') {
      tokens.push({
        type: 'paren',
        value: ')',
      });
      current++;
      continue;
    }
    if(char === ",") {
      tokens.push({
        type: 'arg_sep'
      });
      current++;
      continue;
    }

    // Whitespace is ignored
    // Note: whitespace in strings are handled separately in the string handler
    let WHITESPACE = /\s/;
    if (WHITESPACE.test(char)) {
      current++;
      continue;
    }

    let NUMBERS = /[-+.0-9]/;
    if (NUMBERS.test(char)) {
      let value = '';

      while (NUMBERS.test(char)) {
        value += char;
        char = input[++current];
      }

      if(!value.match(/^[+-]?([0-9]*\.)?[0-9]+$/)) {
        throw "Invalid number '"+value+"'"
      }

      tokens.push({ type: 'number', value });
      continue;
    }

    // Variable
		if (char === '&') {
      let value = '';

      // Skip the '&'
      char = input[++current];

      while (char.match(/[a-zA-Z0-9_]/)) {
        value += char;
        char = input[++current];
      }

      tokens.push({ type: 'var_ref', value });

      continue;
		}

    // Feature reference
		if (char === '@') {
      let value = '';

      // Skip the '@'
      char = input[++current];

      while (char.match(/[a-zA-Z0-9_]/)) {
        value += char;
        char = input[++current];
      }

      tokens.push({ type: 'feature_ref', value });
      continue;
		}

		if (char === '"') {
      // Keep a `value` variable for building up our string token.
      let value = '';

      // We'll skip the opening double quote in our token.
      char = input[++current];

      // Iterate through each character until we reach another double quote.
      var prev;
      while (prev === "\\" || char !== '"') {
        value += char;
        prev = char;
        char = input[++current];
        if(char === undefined) {
          throw "Missing closing quote";
        }
      }

      if(char !== "\"") {
        throw "Missing closing quote"
      }

      // Skip the closing double quote.
      char = input[++current];

      tokens.push({ type: 'string', value });

      continue;
		}


    let LETTERS = /[^)( \t]/i;
    if (LETTERS.test(char)) {
      let value = '';

			// This allows for log10 method name but not 10log
      while (char && LETTERS.test(char)) {
        value += char;
        char = input[++current];
      }

      // And pushing that value as a token with the type `name` and continuing.
      tokens.push({ type: 'name', value });

      continue;
		}

    throw new TypeError('I don\'t know what this character is: ' + char);
  }

	return tokens;
}

function parser(tokens, depth) {
  depth = depth || 0;

  // Cursor
  let current = 0;

  function walk() {

    let token = tokens[current];
    let prevToken = tokens[current-1];

    var prevIsSep = (
      !prevToken
      || prevToken.type === "arg_sep"
      || prevToken.type === "paren"
    )

    if(token.type === "arg_sep") {
      token = tokens[++current];
    }
    else if(!prevIsSep) {
      // Any argument **must** pre proceeded with a separtor
      throw "Expecting argument separator";
    }

    if (token.type === 'number') {

      // If we have one, we'll increment `current`.
      current++;

      var value = token.value;

      // Work out the type
      if(token.value.match(/[.]/)) {
        value = parseFloat(value, 10);
      }
      else {
        value = parseInt(value, 10);
      }

      return {
        type: 'NumberLiteral',
        value: value
      };
    }

    if (token.type === 'string') {
      current++;

      return {
        type: 'StringLiteral',
        value: token.value,
      };
    }

    if (token.type === 'feature_ref') {
      current++;

      return {
        type: 'FeatureRef',
        value: token.value,
      };
    }

    if (token.type === 'var_ref') {
      current++;

      return {
        type: 'VarRef',
        value: token.value,
      };
    }

    if(
      token.type === 'name'
    ) {
      token = tokens[current++];

      let node = {
        type: 'CallExpression',
        name: token.value,
        params: [],
      };

      if(
        tokens[current].type === 'paren' &&
        tokens[current].value !== '('
      ) {
        throw "Missing opening parenthesis";
      }

      // ... and skip the opening parenthesis.
      token = tokens[++current];

      while (
        token && 
        (
          (token.type !== 'paren') ||
          (token.type === 'paren' && token.value !== ')')
        )
      ) {
        // we'll call the `walk` function which will return a `node` and we'll
        // push it into our `node.params`.
        node.params.push(walk());
        token = tokens[current];
      }


      // Check there are some closing parenthesis
      if(!token || token.type !== "paren" || token.value !== ")") {
        throw "Missing paren"
      }
      // ... and skip the closing parenthesis.
      current++;

      return node;
    }

    // Token not recognized
    throw new TypeError(token.type);
  }

  let ast = {
    type: 'Program',
    body: [],
  };

  while (current < tokens.length) {
    ast.body.push(walk());
  }

  if(depth === 0 && ast.body.length > 1) {
    throw "Only allowed one top level expression";
  }

  return ast;
}

function transformer(nodes) {
  function walk(node) {
    if(node.type === "CallExpression") {
      var args = node.params.map(function(node) {
        return walk(node)
      })
      return [node.name].concat(args);
    }
    else if (node.type === "StringLiteral") {
      return node.value;
    }
    else if (node.type === "NumberLiteral") {
      return node.value;
    }
    else if (node.type === "FeatureRef") {
      return ["get", node.value];
    }
    else if (node.type === "VarRef") {
      return ["var", node.value];
    }
  }

  if(nodes.body.length < 1) {
    return [];
  }
  else {
    return walk(nodes.body[0]);
  }
}

function compiler(input) {
  let tokens = tokenizer(input);
  let ast    = parser(tokens);
  let output = transformer(ast);

  return output;
}

function codeGenerator(nodes) {
  function walk(node) {
    var out;

    if(node.type === "CallExpression") {
      var args = node.params.map(function(node) {
        return walk(node)
      }).join(",");

      out = node.name+"("+args+")";
    }
    else if (node.type === "StringLiteral") {
      out = JSON.stringify(node.value);
    }
    else if (node.type === "NumberLiteral") {
      out = JSON.stringify(node.value);
    }
    else if (node.type === "FeatureRef") {
      out = "@"+node.value;
    }
    else if (node.type === "VarRef") {
      out = "&"+node.value;
    }
    else {
      throw "Invalid node "+JSON.stringify(node);
    }

    return out;
  }

  return nodes.body.map(function(node) {
    return walk(node);
  }).join("")
}


/**
 * This is a bit messy at the moment and should parse back to the AST
 */
function decompile(node, depth) {
  depth = depth || 0;

  if(node.length < 1) {
    if(depth > 0) {
      throw "node requires function name";
    }
    else {
      // Empty expression
      return "";
    }
  }

  var command = node[0];
  var args = node.slice(1);

  if(command == "get") {
    if(node.length !== 2) {
      throw "'get' has too many params";
    }
    return "@"+node[1]
  }
  else {
    var argsStr = args.map(function(childNode) {
      if(Array.isArray(childNode)) {
        return decompile(childNode)
      }
      else if(typeof(childNode) === "number") {
        return childNode
      }
      else {
        return "\""+childNode+"\"";
      }
    })
    .join(", ")

    return command+"("+argsStr+")"
  }
}


module.exports = {
  tokenizer,
  parser,
  transformer,
  compiler,
  decompile,
  codeGenerator
};


},{}],2:[function(require,module,exports){
var simpleExpr = require("../");

var inputEl  = document.querySelector(".input");
var debugEl  = document.querySelector(".debug");
var outputEl = document.querySelector(".output");

function update() {
  var input = inputEl.value;

  var pos = {
    start: inputEl.selectionStart,
    end:   inputEl.selectionEnd
  };

  function findPos(input, positions) {
    var total = 0;
    var out = [];

    input.split("\n")
      .forEach(function(line, colIdx) {
        var prevTotal = total;
        total += line.length + 1/*The removed '\n' char */;

        positions.forEach(function(_pos, idx) {
          if(!out.hasOwnProperty(idx) && _pos < total) {
            out[idx] = {
              row: _pos - prevTotal,
              col: colIdx
            }
          }
        })
      })

    return out;
  }

  function findPosFromCol(input, positions) {
    var total = 0;
    var out = [];

    input.split("\n")
      .forEach(function(line, colIdx) {
        positions.forEach(function(_pos, idx) {
          if(colIdx == _pos.col) {
            out[idx] = total + _pos.row;
          }
        })

        total += line.length + 1/*The removed '\n' char */;
      })

    return out;
  }

  var colrow = findPos(input, [pos.start, pos.end]);
  console.log("colrow", colrow);

  try {
    var json = simpleExpr.compiler(input);
    var code = simpleExpr.decompile(json);

    var colRowNew = findPosFromCol(code, colrow);
    console.log("colRowNew", colRowNew);

    if(colRowNew.length > 0) {
      if(colRowNew.length < 2) {
        colRowNew[1] = code.length;
      }

      code = code.substring(0, colRowNew[0])
        + "<span class='debug-selected'>"+code.substring(colRowNew[0], colRowNew[1])+"</span>"
        + code.substring(colRowNew[1])
    }

    outputEl.innerHTML = code;
  }
  catch(err) {
    outputEl.innerHTML = "ERR: "+err;
  }

  debugEl.innerHTML = "cursor: "+JSON.stringify(colrow);

}

inputEl.addEventListener("keyup", update);
inputEl.addEventListener("mouseup", update);
update();

},{"../":1}]},{},[2]);

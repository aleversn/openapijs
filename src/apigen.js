const docsHelper = require("./docs");
const loger = require("./log");
const render = require("./render");

let apis = {};

async function decode(docs) {
  let paths = docs.paths;
  if (paths) {
    for (let path in paths) {
      for (let method in paths[path]) {
        let json = paths[path][method];
        let className = json.tags
          ? json.tags[0]
            ? json.tags[0]
            : "common"
          : "common";
        if (!apis[className]) {
          apis[className] = {};
        }
        let api = {
          path: path.replace(/{/g, "'+").replace(/}/g, "+'"),
          method: method,
          query: [],
          parameters: [],
          data: [],
          contentType: "",
          summary: json.summary,
        };
        if (!json.operationId) {
          loger.error("operationId undefined.Please contact backend...");
          process.exit(1);
        }
        // repeat operationId
        let id = 1;
        while (apis[className][json.operationId]) {
          json.operationId += id;
          ++id;
        }
        // decode query or path params
        if (json.parameters) {
          for (let key in json.parameters) {
            let parameter = json.parameters[key];
            let parm = {
              name: parameter.name,
              type: parameter.schema ? parameter.schema.type : "object",
              summary: parameter.description ? parameter.description : "",
            };

            if (parameter.in == "query") {
              api.query.push(parm);
              api.parameters.push(parm);
            } else if (parameter.in == "path") {
              let rgx = new RegExp("\\'\\+" + parm.name + "\\+\\'", "gi");
              api.path = api.path.replace(
                rgx,
                "'+" + parm.name.toLowerCase() + "+'"
              );
              let lowerRex = new RegExp(
                "\\'\\+" + parm.name.toLowerCase() + "\\+\\'",
                "gi"
              );
              api.path = api.path.replace(
                lowerRex,
                "'+" + parm.name.toLowerCase() + "+'"
              );
              api.path = api.path.replace(
                "'+" + parm.name.toLowerCase() + "+'",
                "'+" + ("Path" + parm.name).toLowerCase() + "+'"
              );
              parm.name = "Path" + parm.name;
              api.parameters.push(parm);
            }
          }
        }
        // decode form or body data
        if (json.requestBody) {
          let parameter = json.requestBody.content;
          if (!parameter) continue;
          for (let content in parameter) {
            let item = parameter[content];
            if (content == "multipart/form-data") {
              api.contentType = content;
              let parameter = item.schema;
              if (!parameter) continue;
              parameter = parameter.properties;
              if (!parameter) continue;
              for (let item in parameter) {
                let parm = {
                  name: item,
                  type: parameter[item].type ? parameter[item].type : "object",
                  summary: parameter[item].description
                    ? parameter[item].description
                    : "",
                };
                api.parameters.push(parm);
                api.data.push(parm);
              }
            } else if (content == "application/json") {
              api.contentType = content;
              let parameter = item.schema;

              // 如果是个对象
              let ref = parameter.$ref.split("/");
              parameter = docs;
              for (let index in ref) {
                let key = ref[index];
                if (key != "#") parameter = parameter[key];
              }

              parameter = parameter.properties;
              if (!parameter) continue;
              for (let item in parameter) {
                let parm = {
                  name: item,
                  type: parameter[item].type ? parameter[item].type : "object",
                  summary: parameter[item].description
                    ? parameter[item].description
                    : "",
                };
                api.parameters.push(parm);
                api.data.push(parm);
              }
            } else {
              continue;
            }
          }
        }
        // assign response type for blob
        if (json.responses[200]) {
          if (json.responses[200].content)
            for (let key in json.responses[200].content) {
              if (key != "application/json" && key != "text/plain") {
                api["responseType"] = "blob";
              } else if (key == "text/plain") {
                api["responseType"] = "text";
              } else {
                api["responseType"] = "json";
              }
              break;
            }
          else {
            api["responseType"] = "json"; // default
          }
        } else {
          api["responseType"] = "json"; // default
        }
        apis[className][json.operationId] = api;
      }
    }
  } else {
    loger.error("Document missing api");
    process.exit(1);
  }
}

const actionT = require("./template/action");
const classT = require("./template/class");
const indexT = require("./template/index");

async function gen(apis) {
  let apiContent = [indexT];
  for (let className in apis) {
    let functions = [];
    let controller = apis[className];
    for (let methodName in controller) {
      loger.info((className + "." + methodName).green);
      let action = controller[methodName];
      let comment = [];
      comment.push("  * @summary " + action.summary);
      for (let index in action.parameters) {
        let item = action.parameters[index];
        comment.push(
          "  * @param {" +
            item.type +
            "} [" +
            item.name.toLowerCase() +
            "] " +
            item.summary
        );
      }
      comment = comment.join("\n");
      let paramsName = [];
      for (let index in action.parameters) {
        // decode complex object
        if (action.parameters[index].name.indexOf('.')!=-1){
            let tempPara = (action.parameters[index].name).split('.').slice()[0].toLowerCase();
            if (paramsName.indexOf(tempPara)!=-1) continue; 
        }
        paramsName.push((action.parameters[index].name).split('.').slice()[0].toLowerCase());
      }
      paramsName = paramsName.join(",");
      let dataName = [];
      for (let index in action.data) {
        if (action.data[index].name.indexOf('.')!=-1){
            let tempPara = (action.data[index].name).split('.').slice()[0].toLowerCase();
            if (dataName.indexOf(tempPara)!=-1) continue; 
        }
        dataName.push((action.data[index].name).split(".").slice()[0].toLowerCase().toLowerCase());
      }
      dataName = dataName.join(",");
      let queryName = [];
      for (let index in action.query) {
        if (action.query[index].name.indexOf('.')!=-1){
            let tempPara = (action.query[index].name).split('.').slice()[0].toLowerCase();
            if (queryName.indexOf(tempPara)!=-1) continue; 
        }
        queryName.push((action.query[index].name).split(".").slice()[0].toLowerCase().toLowerCase());
      }
      let apiT = render(actionT, {
        comment,
        methodName,
        paramsName,
        dataName,
        queryName,
        url: action.path,
        method: action.method,
        contentType: action.contentType,
        responseType: action.responseType,
      });
      functions.push(apiT);
    }
    functions = functions.join("\n");
    apiContent.push(
      render(classT, {
        className,
        functions,
      })
    );
  }
  apiContent = apiContent.join("\n");
  return apiContent;
}

module.exports = async function (url) {
  let docs = await docsHelper.getDocs(url);
  await decode(docs);
  return await gen(apis);
};

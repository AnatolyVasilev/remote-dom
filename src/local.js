/* eslint-env browser */

import {Commands, Constants, MessagesQueue, EventDOMNodeAttributes, WeirdBooleanAttrs} from './common';

class LocalContainer {
  constructor (queueIndex, domElement, name) {
    this.domElement = domElement;
    this.name = name;
    this.queueIndex = queueIndex;
    this.index = null;
  }
}

const containersByQueueAndName = {};
const queuesByIndex = {};
const elementsByQueue = {};
const eventsByQueueAndName = {};
const nativeInvocationsByQueue = {};
const pendingMessagesByQueue = {};
const containerUpdatesObserversByQueue = {};
const containerRemoteIdToNameByQueue = {};

let win = null;
let doc = null;

function setWindow (windowObj) {
  win = windowObj;
  doc = windowObj.document;
}

if (typeof window !== 'undefined') {
  setWindow(window);
}

function createContainer (queueIndex, domElement, name, cb) {
  name = name || Constants.DEFAULT_NAME;
  const res = new LocalContainer(queueIndex, domElement, name);
  containersByQueueAndName[queueIndex][name] = res;
  containerUpdatesObserversByQueue[queueIndex][name] = cb;

  const pendingMessages = pendingMessagesByQueue[queueIndex];
  pendingMessagesByQueue[queueIndex] = [];
  applyMessages(queueIndex, pendingMessages);

  return res;
}

function serializeEventVal (queueIndex, val) {
  if (val === win) {
    return Constants.WINDOW;
  } else if (val && val.window === val) {
    return null;
  } else if (val === doc) {
    return Constants.DOCUMENT;
  } else if (val instanceof win.Node) {
    return val[Constants.QUEUE_INDEX] === queueIndex ? val[Constants.NODE_INDEX] : null;
  } else if (val instanceof Array) {
    return val.map((v) => serializeEventVal(queueIndex, v));
  } else if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
    return val;
  } else if (typeof val === 'function') {
    return null;
  }
  return val;
}

function generalEventHandler (queueIndex, evtTarget, evtName, ev) {
  const evtJSON = {extraData: {}};
  const path = ev.path || EventDOMNodeAttributes.map((field) => ev[field]).filter((x) => x);
  path.forEach(node => {
    evtJSON.extraData[serializeEventVal(queueIndex, node)] = {
      $value: node.value,
      type: node.type,
      checked: node.checked
    };
  });

  for (let field in ev) {
    evtJSON[field] = serializeEventVal(queueIndex, ev[field]);
  }

  queuesByIndex[queueIndex].push([Constants.EVENT, evtTarget, evtName, evtJSON]);

  const elements = elementsByQueue[queueIndex];
  const element = elements && elements[evtTarget];
  if (evtName === 'submit' || shouldPreventDefault(element, ev)) {
    ev.preventDefault();
  }
}

function shouldPreventDefault(element, event) {
  if (!element || !event || typeof element.hasAttribute !== "function") {
    return false;
  }

  if (event.type === "keydown" && event.keyCode <= 123 && event.keyCode >= 112) {
    return false;
  }

  return element.hasAttribute("data-" + event.type + "-prevent-default");
}

function createHandleMsgOrQueueWrapper (handler) {
  return (queueIndex, msg) => {
    const wasMessageHandled = handler(queueIndex, msg);

    if (!wasMessageHandled) {
      pendingMessagesByQueue[queueIndex].push(msg);
    }
  };
}

function wrapAll (obj, wrapperFn) {
  return Object.keys(obj).reduce((res, fnName) => {
    res[fnName] = wrapperFn(obj[fnName]);
    return res;
  }, {});
}

const messageHandlers = wrapAll({
  [Commands.createContainer]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const containers = containersByQueueAndName[queueIndex];
    const containerRemoteIdToName = containerRemoteIdToNameByQueue[queueIndex];
    const containerName = msg[2];
    const containerRemoteId = msg[1];
    containerRemoteIdToName[containerRemoteId] = containerName;
    if (containers[containerName]) {
      elements[containerRemoteId] = containers[containerName].domElement;
      return true;
    }

    return false;
  },
  [Commands.createElement]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    elements[msg[1]] = doc.createElement(msg[2].toLowerCase());
    elements[msg[1]][Constants.QUEUE_INDEX] = queueIndex;
    elements[msg[1]][Constants.NODE_INDEX] = msg[1];
    return true;
  },
  [Commands.createElementNS]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    elements[msg[1]] = doc.createElementNS(msg[2], msg[3].toLowerCase());
    elements[msg[1]][Constants.QUEUE_INDEX] = queueIndex;
    elements[msg[1]][Constants.NODE_INDEX] = msg[1];
    return true;
  },
  [Commands.createTextNode]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    elements[msg[1]] = doc.createTextNode(msg[2]);
    elements[msg[1]][Constants.QUEUE_INDEX] = queueIndex;
    elements[msg[1]][Constants.NODE_INDEX] = msg[1];
    return true;
  },
  [Commands.createComment]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    elements[msg[1]] = doc.createComment(msg[2]);
    elements[msg[1]][Constants.QUEUE_INDEX] = queueIndex;
    elements[msg[1]][Constants.NODE_INDEX] = msg[1];
    return true;
  },
  [Commands.createDocumentFragment]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    elements[msg[1]] = doc.createDocumentFragment(msg[2]);
    return true;
  },
  [Commands.appendChild]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const parentId = msg[1];
    const childId = msg[2];

    if (elements[parentId]) {
      elements[parentId].appendChild(elements[childId]);
      return true;
    }

    return false;
  },
  [Commands.insertBefore]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const parentNodeId = msg[1];
    const newChildNodeId = msg[2];
    const referenceNodeId = msg[3];

    if (elements[parentNodeId]) {
      elements[parentNodeId].insertBefore(elements[newChildNodeId], referenceNodeId ? elements[referenceNodeId] : null);
      return true;
    }

    return false;
  },
  [Commands.removeChild]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const parentId = msg[1];
    const childId = msg[2];

    if (elements[parentId] && elements[childId]) {
      elements[parentId].removeChild(elements[childId]);
      return true;
    }

    return false;
  },
  [Commands.replaceChild]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const parentId = msg[1];
    const newChildId = msg[2];
    const oldChildId = msg[3];

    if (elements[parentId] && elements[newChildId] && elements[oldChildId]) {
      elements[parentId].replaceChild(elements[newChildId], elements[oldChildId]);
      return true;
    }

    return false;
  },
  [Commands.setAttribute]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      if (WeirdBooleanAttrs.includes(msg[2])) {
        (elements[msg[1]])[msg[2]] = msg[3];
      } else {
        elements[msg[1]].setAttribute(msg[2], msg[3]);
      }
      return true;
    }

    return false;
  },
  [Commands.removeAttribute]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].removeAttribute(msg[2]);
      return true;
    }

    return false;
  },
  [Commands.setStyles]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].style = msg[2];
      return true;
    }

    return false;
  },
  [Commands.setStyle]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].style[msg[2]] = msg[3];
      return true;
    }

    return false;
  },
  [Commands.innerHTML]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].innerHTML = msg[2];
      return true;
    }

    return false;
  },
  [Commands.innerText]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].innerText = msg[2];
      return true;
    }

    return false;
  },
  [Commands.textContent]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      elements[msg[1]].textContent = msg[2];
      if (msg[3]) {
        elements[msg[3]] = elements[msg[1]].firstChild;
      }
      return true;
    }
    return false;
  },
  [Commands.setValue]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
    elements[msg[1]].value = msg[2];
      return true;
    }
    return false;
  },
  [Commands.pause]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
    elements[msg[1]].pause();
      return true;
    }
    return false;
  },
  [Commands.play]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
    elements[msg[1]].play();
      return true;
    }
    return false;
  },
  [Commands.src]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
    elements[msg[1]].src = msg[2];
      return true;
    }
    return false;
  },
  [Commands.focus]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
      elements[msg[1]].focus();
      return true;
    }
    return false;
  },
  [Commands.scrollIntoView]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
      elements[msg[1]].scrollIntoView(msg[2]);
      return true;
    }
    return false;
  },
  [Commands.scroll]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const element = elements[msg[1]];
    if (elements[msg[1]]) {
      const param1 = msg[2];
      const param2 = msg[3];
      if (param2 !== undefined && param2 !== null) {
        element.scroll(param1, param2);
      }
      else {
        element.scroll(param1);
      }
      return true;
    }

    return false;
  },
  [Commands.scrollTo]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const element = elements[msg[1]];
    if (elements[msg[1]]) {
      const param1 = msg[2];
      const param2 = msg[3];
      if (param2 !== undefined && param2 !== null) {
        element.scrollTo(param1, param2);
      }
      else {
        element.scrollTo(param1);
      }
      return true;
    }

    return false;
  },
  [Commands.scrollBy]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const element = elements[msg[1]];
    if (elements[msg[1]]) {
      const param1 = msg[2];
      const param2 = msg[3];
      const scrollLeftMax = element.scrollWidth - element.clientWidth;
      const scrollTopMax = element.scrollHeight - element.clientHeight;
      let deltaX = 0;
      let deltaY = 0;
      if (param2 !== undefined && param2 !== null) {
        deltaX = param1 || 0;
        deltaY = param2 || 0;
      }
      else {
        deltaX = param1.left || 0;
        deltaY = param1.top || 0;
      }

      element.scrollLeft = Math.min(deltaX + element.scrollLeft, scrollLeftMax);
      element.scrollTop = Math.min(deltaY + element.scrollTop, scrollTopMax);
      return true;
    }

    return false;
  },
  [Commands.setSelectionRange]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    if (elements[msg[1]]) {
      elements[msg[1]].setSelectionRange(msg[2], msg[3], msg[4]);
      return true;
    }
    return false;
  },
  [Commands.addEventListener]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const events = eventsByQueueAndName[queueIndex];

    if (elements[msg[1]]) {
      const func = generalEventHandler.bind(null, queueIndex, msg[1], msg[2]);
      events[msg[2]] = events[msg[2]] || {};
      events[msg[2]][msg[3]] = func;
      elements[msg[1]].addEventListener(msg[2], func, msg[4]);
      return true;
    }

    return false;
  },
  [Commands.removeEventListener]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const events = eventsByQueueAndName[queueIndex];

    if (elements[msg[1]]) {
      events[msg[2]] = events[msg[2]] || {};
      const origFunc = events[msg[2]][msg[3]];
      elements[msg[1]].removeEventListener(msg[2], origFunc);
      return true;
    }

    return false;
  },
  [Commands.dispatchEvent]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];

    if (elements[msg[1]]) {
      const evt = msg[4] ? new win.CustomEvent(msg[2], msg[3]) : new win.Event(msg[2], msg[3]);
      elements[msg[1]].dispatchEvent(evt);
      return true;
    }

    return false;
  },
  [Commands.initiated]: (queueIndex) => {
    handleRemoteInit(queueIndex);
  },
  [Commands.invokeNative]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const nativeInvocations = nativeInvocationsByQueue[queueIndex];

    if (elements[msg[1]]) {
      if (nativeInvocations[msg[2]]) {
        nativeInvocations[msg[2]](elements[msg[1]], msg[3]);
      }
      return true;
    }

    return false;
  },
  [Commands.setContextProperty]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const canvas = elements[msg[1]];

    if (canvas) {
      const context = canvas.getContext('2d');
      context[msg[2]] = msg[3];
      return true;
    }

    return false;
  },
  [Commands.invokeContextMethod]: (queueIndex, msg) => {
    const elements = elementsByQueue[queueIndex];
    const canvas = elements[msg[1]];

    if (canvas) {
      const context = canvas.getContext('2d');
      context[msg[2]].apply(context, msg[3]);
      return true;
    }

    return false;
  },
}, createHandleMsgOrQueueWrapper);

function applyMessages (queueIndex, messages) {
  if (!queuesByIndex[queueIndex]) {
    return;
  }

  const updatedContainers = {};
  messages.forEach(msg => {
    const msgType = msg[0];
    messageHandlers[msgType](queueIndex, msg);
    const containerId = msg[msg.length-1];
    if (containerId) {
      const name = containerRemoteIdToNameByQueue[queueIndex][containerId];
      if (name) {
        updatedContainers[name] = true;
      }
    }
  });
  Object.keys(updatedContainers).forEach(name => {
    const callback = containerUpdatesObserversByQueue[queueIndex][name];
    callback && callback();
  });
}

function handleRemoteInit (queueIndex) {
  updateRemoteOnInit(queueIndex);
  registerToWindowChanges(() => updateRemoteOnInit(queueIndex));
}

function updateRemoteOnInit(queueIndex) {
  if (!queuesByIndex[queueIndex]) {
    return;
  }

  queuesByIndex[queueIndex].push([Constants.INIT, {
    WINDOW: {
      screen: {
        width: win.screen.width,
        height: win.screen.height,
        deviceXDPI: win.screen.deviceXDPI,
        logicalXDPI: win.screen.logicalXDPI,
        orientation: {
          angle: win.screen.orientation && win.screen.orientation.angle,
          type: win.screen.orientation && win.screen.orientation.type
        }
      },
      devicePixelRatio: win.devicePixelRatio,
      innerWidth: win.innerWidth,
      innerHeight: win.innerHeight
    },
    DOCUMENT: {
      body: {
        clientWidth: doc.body.clientWidth
      }
    }
  }]);
}

function registerToWindowChanges (callback) {
  win.addEventListener('orientationchange', callback);
  win.addEventListener('resize', callback);
}

function createMessageQueue (channel, timerFunction, nativeInvocations) {
  if (!win) {
    throw new Error('Please setWindow before create message queues');
  }
  const queue = new MessagesQueue();
  const queueIndex = queue.index;
  queuesByIndex[queueIndex] = queue;
  containersByQueueAndName[queueIndex] = {};
  containerUpdatesObserversByQueue[queueIndex] = {};
  containerRemoteIdToNameByQueue[queueIndex] = {};
  elementsByQueue[queueIndex] = {};
  nativeInvocationsByQueue[queueIndex] = nativeInvocations || {};
  pendingMessagesByQueue[queueIndex] = [];
  elementsByQueue[queueIndex][Constants.DOCUMENT] = doc;
  elementsByQueue[queueIndex][Constants.WINDOW] = win;
  eventsByQueueAndName[queueIndex] = {};
  queue.setPipe(channel, applyMessages.bind(null, queueIndex), timerFunction);
  return queueIndex;
}

function hostHtmlElement(channelParameter, htmlElementParameter) {
  setWindow(self);

  const localQueueIndex = createMessageQueue(
    channelParameter,
    callback => requestAnimationFrame(callback),
    {});

  const localContainer = createContainer(localQueueIndex, htmlElementParameter);
  return () => {
    const queue = queuesByIndex[localQueueIndex];
    if (!queue) {
      return;
    }

    queue.pipe.dispose();

    const elements = elementsByQueue[localContainer.queueIndex];
    const events = eventsByQueueAndName[localContainer.queueIndex];
    Object.keys(events).forEach(eventName => {
      Object.keys(events[eventName]).forEach(funcKey => {
        const origFunc = events[eventName][funcKey];
        Object.keys(elements).forEach(elementKey => {
          const element = elements[elementKey];
          if (element) {
            element.removeEventListener(eventName, origFunc);
          }
        });
      });
    });

    delete queuesByIndex[localContainer.queueIndex];
    delete elementsByQueue[localContainer.queueIndex];
    delete eventsByQueueAndName[localContainer.queueIndex];
    delete nativeInvocationsByQueue[localContainer.queueIndex];
    delete pendingMessagesByQueue[localContainer.queueIndex];
    delete containerUpdatesObserversByQueue[localContainer.queueIndex];
    delete containerRemoteIdToNameByQueue[localContainer.queueIndex];
    delete containersByQueueAndName[localContainer.queueIndex];
  };
}

export {
  createContainer,
  createMessageQueue,
  setWindow,
  hostHtmlElement
};

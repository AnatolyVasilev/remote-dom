import testUtils from './testUtils';
import React from 'react';
import ReactDOM from 'react-dom';
import * as remoteDOM from '../remote';
import * as localDOM from '../local';

let domContainer, remoteContainer;
let counter = 0;
let env, document;

describe('canvas tests', () => {
  beforeEach(() => {
    env = testUtils.setup();
    document = env.jsdomDefaultView.window.document;
    domContainer = document.createElement('div');
    const id = 'container_' + counter++;
    document.body.appendChild(domContainer);
    localDOM.createContainer(env.localQueue, domContainer, id);
    remoteContainer = remoteDOM.createContainer(id);
  });

  it('should set attributes', done => {

    const expectFunc = (svgNode) => {
      const value = "200";
      const attribute = "width";
      const localCanvasNode = domContainer.firstChild;
      svgNode.setAttribute(attribute, value);

      expect(localCanvasNode.getAttribute(attribute)).toBe(value);
      done();
    };
    const statelessComp = () => (<canvas ref={expectFunc} />);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('should set context attrs', done => {

    const expectFunc = (canvasNode) => {

      expect(canvasNode.tagName).toBe("CANVAS");
      const localCanvasNode = domContainer.firstChild;
      const localContext = localCanvasNode.getContext('2d');
      const remoteContext = canvasNode.getContext('2d');
      expect(localContext.font).toBe('10px sans-serif');
      remoteContext.font = '20px sans-serif';
      expect(localContext.font).toBe('20px sans-serif');
      const e = () => remoteContext.font2 = 1;
      expect(e).toThrow();
      done();
    };
    const statelessComp = () => (<canvas ref={expectFunc} />);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });
});

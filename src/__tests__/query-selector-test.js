import testUtils from './testUtils';
import React from 'react';
import ReactDOM from 'react-dom';
import * as remoteDOM from '../remote';
import * as localDOM from '../local';

let domContainer, remoteContainer;
let counter = 0;
let env, document;

describe('query selector tests', () => {
  beforeEach(() => {
    env = testUtils.setup();
    document = env.jsdomDefaultView.window.document;
    domContainer = document.createElement('div');
    const id = 'container_' + counter++;
    document.body.appendChild(domContainer);
    localDOM.createContainer(env.localQueue, domContainer, id);
    remoteContainer = remoteDOM.createContainer(id);
  });

  it('check class names manually', done => {

    const expectFunc = (remoteNode) => {
      const className1 = "test1";
      const className2 = "test2-ui7";
      const localCanvasNode = domContainer.firstChild;
      remoteNode.classList.add(className1);

      expect(localCanvasNode.className).toBe(className1);

      remoteNode.classList.add(className2);
      expect(localCanvasNode.className).toBe(`${className1} ${className2}`);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} />);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check class names', done => {
    const className1 = "test1";
    const className2 = "test2-ui7";
    const expectFunc = () => {
      const localCanvasNode = domContainer.firstChild;
      expect(localCanvasNode.className).toBe(`${className1} ${className2}`);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} className={[className1, className2].join(' ')}/>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check id', done => {
    const id = "test1";
    const expectFunc = (remoteNode) => {
      const localCanvasNode = domContainer.firstChild;
      expect(localCanvasNode.id).toBe(id);
      remoteNode.id = "test2";
      expect(localCanvasNode.id).toBe(remoteNode.id);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} id={id}/>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check getElementById', done => {
    const idName = 'test4id';
    const expectFunc = () => {
      const found = remoteContainer.getElementById(idName);
      expect(found.id).toBe(idName);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} id={idName}/>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check querySelector with class', done => {
    const className = 'test4id';
    const expectFunc = () => {
      const found = remoteContainer.querySelector(`.${className}`);
      expect(found.className).toBe(className);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} className={className}/>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check querySelector with attribute', done => {
    const attrValue = 'test4id';
    const expectFunc = () => {
      const found = remoteContainer.querySelector(`div[data-test=${attrValue}]`);
      expect(found.getAttribute('data-test')).toBe(attrValue);
      done();
    };
    const statelessComp = () => (<div ref={expectFunc} data-test={attrValue}/>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });

  it('check querySelector with parent', done => {
    const attrValue = 'test4id';
    const expectFunc = () => {
      const found = remoteContainer.querySelector(`span div[data-test=${attrValue}]`);
      expect(found.getAttribute('data-test')).toBe(attrValue);
      done();
    };
    const statelessComp = () => (<span><div ref={expectFunc} data-test={attrValue}/></span>);
    ReactDOM.render(React.createElement(statelessComp), remoteContainer);
  });
});

import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';

import AceEditor from 'react-ace';
import SplitPane from 'react-split-pane';
import Frame from 'react-frame-component';
import debounce from 'lodash.debounce';
import axios from 'axios';
import handlebars from 'handlebars/dist/cjs/handlebars';

import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/theme-monokai';

import qs from 'qs';

import './App.css';
import 'normalize.css';

import htmlExample from './html-example';
import cssExample from './css-example';

import { useLocalStorage } from '@rehooks/local-storage';
import ClipLoader from 'react-spinners/ClipLoader';

const host = 'http://localhost:3003/api';

const Editor = ({ label, mode, ...props }) => (
  <div className="Editor">
    <div className="Editor-title">{label}</div>
    <AceEditor
      setOptions={{ useWorker: false }}
      mode={mode}
      theme="monokai"
      name={`${mode.toUpperCase()}Editor`}
      height="100%"
      width="100%"
      wrapEnabled
      tabSize={2}
      {...props}
    />
  </div>
);

const Button = ({ children, onClick }) => {
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="Button"
      style={{ opacity: loading ? 0.8 : 1 }}
      disabled={loading}
      onClick={async () => {
        console.log('Clicked button');
        setLoading(true);
        await onClick();
        setLoading(false);
      }}
    >
      <span style={{ opacity: loading ? 0 : 1 }}>{children}</span>
      <span className="Button-spinner">
        {loading && <ClipLoader size={16} color="white" />}
      </span>
    </button>
  );
};

const debouncedFetchPreview = debounce(
  async (data, setUri, setLoading) => {
    setLoading(true);

    const response = await axios.get(`${host}/preview`, {
      params: data,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'image/*',
      },
    });
    
    if (response.headers['content-type']) {
      if (response.headers['content-type'].startsWith('image/')) {
        const b64 = response.data.data
      
        const dataUri = 'data:'+ response.headers['content-type'] +';base64,' + b64;
        
        setUri(dataUri);
      }
    }
    
    setLoading(false);
  },
  1000,
  { maxWait: 5000 }
);

const Preview = ({ html, css, params }) => {
  const [dataUri, setDataUri] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    debouncedFetchPreview(
      {
        body: html,
        styles: css,
        ...params,
      },
      setDataUri,
      setLoading
    );
  }, [html, css, params]);

  const [debouncedHtml] = useDebounce(html, 500);
  const [debouncedParams] = useDebounce(params, 500);
  const [compiledHtml, setCompiledHtml] = useState(() => {
    try {
      return handlebars.compile(html)(params);
    } catch (e) {
      console.warn('Error when compiling handlebars, using raw HTML');
      console.warn(e);

      return html;
    }
  });

  useEffect(() => {
    try {
      const compiled = handlebars.compile(debouncedHtml)(debouncedParams);

      setCompiledHtml(compiled);
    } catch (e) {
      console.warn('Error when compiling handlebars, using raw HTML');
      console.warn(e);
      setCompiledHtml(debouncedHtml);
    }
  }, [debouncedHtml, debouncedParams]);
  
  return (
    <div className="Preview">
      <div className="Preview-item">
        <div className="Preview-title">iframe Preview</div>

        <Frame
          className="Preview-frame"
          head={
            <>
              <style type="text/css">
                {`
                body, html, .frame-root, .frame-content , .frame-content > div {
                  height: 100%;
                  padding: 0;
                  margin: 0;
                }
            `}
              </style>
              <style type="text/css">{css}</style>
            </>
          }
        >
          <div dangerouslySetInnerHTML={{ __html: compiledHtml }} />
        </Frame>
      </div>
      <div className="Preview-item">
        <div className="Preview-title">Image Preview</div>
        <div className="Preview-subtitle">
          {`https://ogi.sh?${qs.stringify({
            template: 'a1b2c3d',
            ...params,
          })}`}
        </div>

        <div className="Preview-itemContent">
          {dataUri && (
            <img className="Preview-image" src={dataUri} alt="Preview" />
          )}

          {loading && (
            <div
              style={{
                margin: 16,
                marginTop: 0,
                position: 'absolute',
                bottom: dataUri ? 8 : 'calc(50% - 32px)',
                right: dataUri ? 8 : 'calc(50% - 32px)',
              }}
            >
              <ClipLoader size={24} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const debouncedWriteQueryParams = debounce(
  async (html, css, params) => {
    const obj = { html, css, params: JSON.stringify(params) };

    const querystring = qs.stringify(obj);

    window.history.replaceState(obj, '', `?${querystring || ''}`);
  },
  1000,
  { maxWait: 5000 }
);

const useQueryParam = (key, json = false) => {
  const params = qs.parse(window.location.search.replace('?', ''));

  // make backwards compatible
  const [storedValue] = useLocalStorage(key);

  if (json) {
    return JSON.parse(params[key] || 'null') || storedValue;
  }

  return params[key] || storedValue;
};

const App = () => {
  const storedHtml = useQueryParam('html');
  const storedCss = useQueryParam('css');
  const storedParams = useQueryParam('params', true) || {};

  const [html, setHtml] = useState(storedHtml || htmlExample);
  const [css, setCss] = useState(storedCss || cssExample);
  const [params, setParams] = useState(
    storedParams || { title: 'Hello, World!' }
  );
  const [paramsJson, setParamsJson] = useState(JSON.stringify(params, null, 2));
  //const [apiKey, setApiKey] = useState('');

  const publish = useCallback(async () => {
    // if (!apiKey) {
    //   alert('Please provide your API key before publishing a template.');

    //   return;
    // }
    
    try {
      const response = await axios.post(
        `${host}/publish`,
        { body: html, styles: css },
        {
          headers: {
            'Content-Type': 'application/json',
            // Authorization: apiKey,
          },
        }
      );

      alert(`Publish successful. ${response.data.message}.`);
    } catch (e) {
      alert(
        'Publish was unsuccessful. Please ensure you are providing a valid API key.'
      );
      console.log(e);
    }
  }, [html, css]); // apiKey here

  useEffect(() => {
    debouncedWriteQueryParams(html, css, params);
  }, [html, css, params]);

  return (
    <div className="App">
      <header className="Header">
        <div className="Header-logo">
          <a href="https://ogimpact.sh">
            <img
              src="https://i.imgur.com/lRT8FxE.png"
              alt="OG IMPACT"
              width={200}
            />
          </a>
          <div className="Header-logoProduct">Editor</div>
          <div className="Header-logoBeta">BETA</div>
        </div>

        <div className="Header-actions">
          <div className="Header-action">
            <a href="https://ogimpact.sh">What's this?</a>
          </div>
          <div className="Header-action">
            <a href="https://github.com/chrisvxd/og-impact">GitHub</a>
          </div>

          <div className="Header-action">
            {/* <input
              type="text"
              placeholder="API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                border: 'none',
                borderRadius: 4,
                fontSize: 16,
                padding: '12px 16px',
                width: 200,
                marginRight: 16,
              }}
            /> */}
            <Button onClick={publish}>Publish to ogi.sh</Button>
          </div>
        </div>
      </header>

      <main className="Main">
        <section style={{ height: '100%', position: 'relative', flexGrow: 1 }}>
          <SplitPane defaultSize="66.7%" split="vertical">
            <SplitPane defaultSize="50%" split="vertical" primary="second">
              <Editor
                label="HTML / Handlebars"
                mode="html"
                onChange={setHtml}
                value={html}
              />

              <Editor label="CSS" mode="css" onChange={setCss} value={css} />
            </SplitPane>

            <Editor
              label="Params"
              mode="json"
              onChange={(val) => {
                try {
                  setParams(JSON.parse(val));
                  setParamsJson(val);
                } catch {
                  console.warn('Error parsing JSON');
                }
              }}
              value={paramsJson}
            />
          </SplitPane>
        </section>

        <Preview html={html} css={css} params={params} />
      </main>
    </div>
  );
};

export default App;

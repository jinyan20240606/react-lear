import React from 'react';
import ReactDOM from 'react-dom/client';
const App = /*#__PURE__*/React.createElement("h1", {
  onClick: () => {}
}, "this is a H1 Tag");
function FnComp() {
  return /*#__PURE__*/React.createElement("div", {
    jsx11: /*#__PURE__*/React.createElement("div", null)
  }, "A Function Component");
}
class ClassComp extends React.Component {
  render() {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, "A Class Component"), /*#__PURE__*/React.createElement(FnComp, null));
  }
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));

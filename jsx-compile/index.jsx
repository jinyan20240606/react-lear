import React from 'react';
import ReactDOM from 'react-dom/client';

const App = <h1 onClick={()=>{}}>this is a H1 Tag</h1>

function FnComp(){
    return <div>A Function Component</div>
  }
class ClassComp extends React.Component{
    render(){
        return <div>
        <h1>A Class Component</h1>
        <FnComp/>
        </div>
    }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
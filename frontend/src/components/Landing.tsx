import { useState } from "react"




export const Landing = () => {
    const [name,setName] = useState("")
    
    return <div>
        <input type="text" onChange={(e) => {
            setName(e.target.value);
        }}>
        </input>

        <button onClick={() => {
            //join room logic here

        }}>
            Join 
        </button>



    </div>
}
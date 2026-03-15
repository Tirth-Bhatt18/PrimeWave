import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./features/movies/components/Home";
import Login from "./features/auth/components/Login";
import Register from "./features/auth/components/Register";
import "./App.css";
import Navbar from "./components/Navbar";
import MovieDetails from "./features/movies/components/MovieDetails";
import Watch from "./features/movies/components/Watch";
import Series from "./features/movies/components/Series";
import Genres from "./features/movies/components/Genres";
import Search from "./features/movies/components/Search";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/movie/:id" element={<MovieDetails />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/genres/:genre" element={<Genres />} />
        <Route path="/search/:query" element={<Search />} />
      </Routes>
    </BrowserRouter>
  );
}


export default App;

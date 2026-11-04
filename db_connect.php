<?php
$host = "localhost";
$user = "root";
$password = "";
$dbname = "lemery_enrollment";

$conn = new mysqli($host, $user, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["error" => "Database Connection Failed: " . $conn->connect_error]));
}
?>
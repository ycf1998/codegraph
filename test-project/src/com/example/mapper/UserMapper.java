package com.example.mapper;

public interface UserMapper {
    
    User getById(Long id);
    
    void delete(Long id);
    
    User insert(String username, String password);
}

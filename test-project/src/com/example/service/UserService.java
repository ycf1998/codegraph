package com.example.service;

import com.example.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    
    private UserMapper userMapper;
    
    public User getUser(Long id) {
        return userMapper.getById(id);
    }
    
    public void deleteUser(Long id) {
        userMapper.delete(id);
    }
    
    public User createUser(String username, String password) {
        return userMapper.insert(username, password);
    }
}
